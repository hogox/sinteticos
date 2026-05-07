// Parsea multipart/form-data desde un IncomingMessage usando busboy.
// Acumula files (Buffer) y campos en memoria, con límites de tamaño.

import Busboy from "busboy";

export const MAX_TOTAL_BYTES = 5 * 1024 * 1024; // 5 MB combinados
export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB por archivo
export const MAX_FILES = 10;

/**
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<{ files: Array<{filename:string, mimetype:string, buffer:Buffer}>, fields: Record<string,string|string[]> }>}
 */
export function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("multipart/form-data")) {
      reject(makeError("CONTENT_TYPE", `Content-Type debe ser multipart/form-data, recibido: ${contentType}`, 400));
      return;
    }

    const busboy = Busboy({
      headers: req.headers,
      limits: {
        fileSize: MAX_FILE_BYTES,
        files: MAX_FILES,
        fields: 50,
        fieldSize: 1 * 1024 * 1024 // 1 MB per text field
      }
    });

    const files = [];
    const fields = {};
    let totalBytes = 0;
    let aborted = false;

    function abort(code, message, status) {
      if (aborted) return;
      aborted = true;
      reject(makeError(code, message, status));
      try {
        req.unpipe(busboy);
      } catch (_) {}
    }

    busboy.on("file", (name, stream, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      let size = 0;
      let truncated = false;

      stream.on("data", (chunk) => {
        size += chunk.length;
        totalBytes += chunk.length;
        if (totalBytes > MAX_TOTAL_BYTES) {
          stream.resume();
          abort("PAYLOAD_TOO_LARGE", `Tamaño total excede ${MAX_TOTAL_BYTES} bytes`, 413);
          return;
        }
        chunks.push(chunk);
      });

      stream.on("limit", () => {
        truncated = true;
        abort("FILE_TOO_LARGE", `Archivo ${filename} excede ${MAX_FILE_BYTES} bytes`, 413);
      });

      stream.on("end", () => {
        if (aborted || truncated || !filename) return;
        files.push({
          filename,
          mimetype: mimeType || "application/octet-stream",
          buffer: Buffer.concat(chunks),
          size
        });
      });
    });

    busboy.on("field", (name, value) => {
      // soportar arrays simples: name=urls -> múltiples valores
      if (name in fields) {
        const existing = fields[name];
        fields[name] = Array.isArray(existing) ? [...existing, value] : [existing, value];
      } else {
        fields[name] = value;
      }
    });

    busboy.on("filesLimit", () => {
      abort("TOO_MANY_FILES", `Máximo ${MAX_FILES} archivos`, 413);
    });

    busboy.on("error", (err) => {
      abort("MULTIPART_PARSE", `Error parseando multipart: ${err.message}`, 400);
    });

    busboy.on("close", () => {
      if (aborted) return;
      resolve({ files, fields });
    });

    req.pipe(busboy);
  });
}

function makeError(code: string, message: string, status?: number) {
  const err: any = new Error(message);
  err.code = code;
  err.status = status || 400;
  return err;
}
