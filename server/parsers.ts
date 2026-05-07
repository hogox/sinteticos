// Parsers para múltiples fuentes de datos: PDF, Excel, URLs.
// Usados por /api/personas/ai-extract-multi para convertir binarios y URLs a texto plano.

import { createRequire } from "node:module";
import ExcelJS from "exceljs";
import * as cheerio from "cheerio";

const require = createRequire(import.meta.url);
// Importamos pdf-parse vía createRequire para que su check `!module.parent` lo trate como
// import normal y NO active el debug runner (que intenta leer ./test/data/05-versions-space.pdf).
const pdfParse = require("pdf-parse");

const URL_FETCH_TIMEOUT_MS = 12_000;
const URL_USER_AGENT =
  "Mozilla/5.0 (compatible; SinteticosLab/0.1; +https://github.com/hogox/sinteticos)";
const URL_MAX_BYTES = 2 * 1024 * 1024; // 2 MB de HTML por URL

/**
 * Parsea un PDF desde un Buffer y devuelve texto plano con marcadores de página.
 * @param {Buffer} buffer
 * @param {string} filename
 * @returns {Promise<{ text: string, pages: number, info: object }>}
 */
export async function parsePdf(buffer, filename = "documento.pdf") {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error(`PDF vacío o inválido: ${filename}`);
  }
  const result = await pdfParse(buffer);
  // pdf-parse devuelve todo el texto concatenado. Dividimos por form feed (\f) que separa páginas.
  const pages = (result.text || "").split("\f").map((p) => p.trim()).filter(Boolean);
  const formatted = pages
    .map((page, idx) => `--- página ${idx + 1} ---\n${page}`)
    .join("\n\n");
  return {
    text: formatted || result.text || "",
    pages: result.numpages || pages.length,
    info: result.info || {}
  };
}

/**
 * Parsea un Excel (.xlsx) y devuelve texto plano con sheets, headers y filas.
 * @param {Buffer} buffer
 * @param {string} filename
 * @returns {Promise<{ text: string, sheets: number, rows: number }>}
 */
export async function parseExcel(buffer, filename = "datos.xlsx") {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error(`Excel vacío o inválido: ${filename}`);
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const lines: string[] = [];
  let totalRows = 0;
  let sheetCount = 0;

  workbook.eachSheet((worksheet) => {
    sheetCount += 1;
    lines.push(`--- sheet: ${worksheet.name} ---`);
    // Detectar headers: primera fila con valores
    let headers = null;
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values = (row.values as any[])
        .slice(1) // ExcelJS usa 1-indexed
        .map((v: any) => formatExcelCell(v));
      if (rowNumber === 1) {
        headers = values;
        lines.push(`headers: ${headers.join(" | ")}`);
        return;
      }
      totalRows += 1;
      if (headers && headers.length === values.length) {
        const labeled = headers
          .map((h, i) => `${h}: ${values[i] || ""}`)
          .filter((s) => s.split(": ")[1])
          .join(", ");
        lines.push(`fila ${rowNumber - 1}: ${labeled}`);
      } else {
        lines.push(`fila ${rowNumber - 1}: ${values.join(" | ")}`);
      }
    });
    lines.push("");
  });

  return {
    text: lines.join("\n"),
    sheets: sheetCount,
    rows: totalRows
  };
}

function formatExcelCell(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    // ExcelJS puede devolver { richText: [...] } o { formula, result } o { hyperlink, text }
    if (value.richText) return value.richText.map((rt) => rt.text).join("");
    if (value.text) return String(value.text);
    if (value.result !== undefined) return String(value.result);
    if (value.hyperlink) return String(value.hyperlink);
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Hace fetch a una URL y extrae texto + metadata del HTML.
 * @param {string} rawUrl
 * @returns {Promise<{ url: string, title: string, text: string, status: number, ok: true }>}
 */
export async function fetchAndParseUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch (error: any) {
    throw new Error(`URL inválida: ${rawUrl}`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Protocolo no soportado: ${url.protocol}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.href, {
      method: "GET",
      headers: { "User-Agent": URL_USER_AGENT, Accept: "text/html,*/*" },
      signal: controller.signal,
      redirect: "follow"
    });

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status} al traer ${url.href}`) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }

    const contentType = response.headers.get("content-type") || "";
    const isHtml = contentType.includes("text/html") || contentType.includes("application/xhtml");
    const isText = contentType.startsWith("text/") || contentType.includes("json");

    if (!isHtml && !isText) {
      throw new Error(`Tipo de contenido no soportado: ${contentType}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      const text = await response.text();
      return finalizeUrlParse(url.href, text, isHtml);
    }

    const chunks = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > URL_MAX_BYTES) {
        await reader.cancel();
        throw new Error(`Respuesta demasiado grande (>${URL_MAX_BYTES} bytes): ${url.href}`);
      }
      chunks.push(value);
    }
    const merged = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    const text = merged.toString("utf8");
    return finalizeUrlParse(url.href, text, isHtml);
  } finally {
    clearTimeout(timeout);
  }
}

function finalizeUrlParse(href, body, isHtml) {
  if (!isHtml) {
    // texto plano o JSON
    return {
      url: href,
      title: href,
      text: body.slice(0, URL_MAX_BYTES),
      ok: true,
      status: 200
    };
  }

  const $ = cheerio.load(body);
  // Quitar elementos sin contenido útil
  $("script, style, noscript, svg, nav, header, footer, iframe, form").remove();

  const title = $("title").first().text().trim() || $("h1").first().text().trim() || href;
  const meta = $('meta[name="description"]').attr("content") || "";

  // Extraer headings + párrafos preservando estructura básica
  const parts = [];
  if (meta) parts.push(`META: ${meta.trim()}`);
  $("h1, h2, h3, p, li, blockquote, td, th, dt, dd").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text || text.length < 2) return;
    const tag = el.tagName?.toLowerCase();
    if (tag && /^h[1-3]$/.test(tag)) {
      parts.push(`\n## ${text}`);
    } else {
      parts.push(text);
    }
  });

  return {
    url: href,
    title,
    text: parts.join("\n").slice(0, URL_MAX_BYTES),
    ok: true,
    status: 200
  };
}

/**
 * Detecta el tipo de archivo por filename + magic bytes mínimos.
 * @param {string} filename
 * @param {Buffer} buffer
 * @returns {"pdf" | "xlsx" | "text" | "unknown"}
 */
export function detectFileType(filename, buffer) {
  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) return "xlsx";
  if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".csv")) return "text";

  if (Buffer.isBuffer(buffer) && buffer.length >= 4) {
    // PDF: %PDF
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return "pdf";
    }
    // XLSX (zip): PK\x03\x04
    if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
      return "xlsx";
    }
    // ASCII printable → text
    const sample = buffer.slice(0, Math.min(buffer.length, 256)).toString("utf8");
    if (/^[\s\x20-\x7e -￿]+$/.test(sample)) {
      return "text";
    }
  }
  return "unknown";
}

/**
 * Punto único para parsear un archivo subido. Decide el parser por tipo.
 * @param {{ filename: string, buffer: Buffer, mimetype?: string }} file
 * @returns {Promise<{ source: string, kind: string, text: string, meta: object }>}
 */
export async function parseFile(file) {
  const { filename, buffer } = file;
  const kind = detectFileType(filename, buffer);

  if (kind === "pdf") {
    const result = await parsePdf(buffer, filename);
    return {
      source: filename,
      kind: "pdf",
      text: result.text,
      meta: { pages: result.pages, info: result.info }
    };
  }

  if (kind === "xlsx") {
    const result = await parseExcel(buffer, filename);
    return {
      source: filename,
      kind: "xlsx",
      text: result.text,
      meta: { sheets: result.sheets, rows: result.rows }
    };
  }

  if (kind === "text") {
    return {
      source: filename,
      kind: "text",
      text: buffer.toString("utf8"),
      meta: { bytes: buffer.length }
    };
  }

  throw new Error(`Tipo de archivo no soportado: ${filename}`);
}
