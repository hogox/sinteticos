/**
 * figma-mcp-client.mjs
 *
 * Adaptador para el Figma MCP oficial.
 * Responsabilidades:
 *   1. Parsear URLs de prototipos Figma
 *   2. Comunicarse con la REST API de Figma para obtener nodos y screenshots
 *   3. Normalizar nodos a candidatos compatibles con chooseCandidate()
 *   4. Resolver transiciones via transitionNodeID
 *
 * Nota: El MCP server oficial de Figma usa HTTP transport. Para esta integracion
 * usamos la REST API directamente (misma fuente de datos, sin dependencia extra de MCP SDK).
 * Si en el futuro se quiere usar el protocolo MCP nativo, se puede adaptar este modulo.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const FIGMA_API_BASE = "https://api.figma.com/v1";
const DEFAULT_TARGET_WIDTH = 360;
const DEFAULT_TARGET_HEIGHT = 640;
const FETCH_TIMEOUT_MS = 12000;
const MAX_CANDIDATES = 24;
const MAX_TREE_DEPTH = 10;
const MAX_IDS_PER_ENRICHMENT = 50;

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

/**
 * Extrae fileKey, nodeId y startingPointNodeId de una URL de prototipo Figma.
 *
 * Formatos soportados:
 *   https://www.figma.com/proto/<fileKey>/<name>?node-id=<nodeId>&starting-point-node-id=<spId>
 *   https://www.figma.com/proto/<fileKey>?node-id=<nodeId>
 *   https://www.figma.com/design/<fileKey>/...
 *   https://www.figma.com/file/<fileKey>/...
 *
 * @param {string} url
 * @returns {{ fileKey: string, nodeId: string|null, startingPointNodeId: string|null } | null}
 */
export function parseFigmaPrototypeUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("figma.com")) return null;

    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return null;

    const kind = segments[0];
    if (!["proto", "design", "file"].includes(kind)) return null;

    const fileKey = segments[1];
    if (!fileKey || fileKey.length < 6) return null;

    const nodeId = parsed.searchParams.get("node-id") || null;
    const startingPointNodeId = parsed.searchParams.get("starting-point-node-id") || null;

    return { fileKey, nodeId, startingPointNodeId };
  } catch (error) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Node ID normalization
// ---------------------------------------------------------------------------

/**
 * Normaliza un nodeId de formato URL (X-Y) a formato API (X:Y).
 * Reemplaza TODOS los guiones, no solo el primero.
 * @param {string|null} nodeId
 * @returns {string|null}
 */
function normalizeNodeId(nodeId) {
  if (!nodeId || typeof nodeId !== "string") return null;
  return nodeId.replaceAll("-", ":");
}

// ---------------------------------------------------------------------------
// Figma REST API client
// ---------------------------------------------------------------------------

/**
 * GET request a la Figma REST API.
 * @param {string} endpoint - path relativo (sin base URL)
 * @param {string} accessToken
 * @returns {Promise<any>}
 */
async function figmaGet(endpoint, accessToken) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${FIGMA_API_BASE}${endpoint}`, {
      headers: { "X-Figma-Token": accessToken },
      signal: controller.signal
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Figma API ${res.status}: ${body.slice(0, 200)}`);
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (parseError) {
      throw new Error(`Figma API: respuesta no es JSON valido (${text.slice(0, 80)})`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Descarga una imagen exportada de Figma y la guarda en disco.
 * @param {string} imageUrl
 * @param {string} destPath
 * @returns {Promise<void>}
 */
async function downloadImage(imageUrl, destPath) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(imageUrl, { signal: controller.signal });
    if (!res.ok) throw new Error(`Image download failed: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(destPath, buffer);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Frame & node extraction
// ---------------------------------------------------------------------------

/**
 * Obtiene los nodos de un frame de Figma.
 *
 * @param {string} fileKey
 * @param {string} nodeId - ID del nodo/frame (formato "X:Y" o "X-Y")
 * @param {string} accessToken
 * @returns {Promise<{ frameName: string, frameWidth: number, frameHeight: number, nodes: FigmaNode[] } | null>}
 *
 * @typedef {Object} FigmaNode
 * @property {string} id
 * @property {string} name
 * @property {string} type
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {string|null} transitionNodeID
 * @property {string|null} characters
 */
export async function getFrameNodes(fileKey, nodeId, accessToken) {
  if (!fileKey || !accessToken) return null;

  try {
    const normalizedId = normalizeNodeId(nodeId);

    let data;
    if (normalizedId) {
      data = await figmaGet(`/files/${fileKey}/nodes?ids=${encodeURIComponent(normalizedId)}`, accessToken);
    } else {
      data = await figmaGet(`/files/${fileKey}?depth=3`, accessToken);
    }

    let rootNode;
    if (data.nodes) {
      // Respuesta de /nodes endpoint — acceder por ID solicitado, con fallback a primer valor
      const entry = (normalizedId && data.nodes[normalizedId]) || Object.values(data.nodes)[0];
      rootNode = entry && entry.document ? entry.document : null;
    } else if (data.document) {
      // Respuesta de /files endpoint — buscar el primer frame de la primera pagina
      rootNode = findFirstFrame(data.document);
    }

    if (!rootNode) return null;

    const bbox = rootNode.absoluteBoundingBox;
    const frameWidth = bbox ? bbox.width : 375;
    const frameHeight = bbox ? bbox.height : 812;
    const frameOriginX = bbox ? bbox.x : 0;
    const frameOriginY = bbox ? bbox.y : 0;

    const nodes = flattenInteractiveNodes(rootNode, frameOriginX, frameOriginY);

    return {
      frameName: rootNode.name || `Frame ${nodeId || "root"}`,
      frameWidth,
      frameHeight,
      nodes
    };
  } catch (error) {
    console.error("getFrameNodes failed:", error.message);
    return null;
  }
}

/**
 * Busca el primer frame valido dentro de un documento Figma.
 * Recorre paginas y busca el primer hijo con tipo FRAME o COMPONENT.
 * @param {object} document
 * @returns {object|null}
 */
function findFirstFrame(document) {
  if (!document.children || !document.children.length) return null;

  for (const page of document.children) {
    if (!page.children || !page.children.length) continue;
    for (const child of page.children) {
      const type = (child.type || "").toUpperCase();
      if (type === "FRAME" || type === "COMPONENT" || type === "COMPONENT_SET") {
        return child;
      }
    }
    // Si no hay frames explícitos, devolver el primer hijo
    return page.children[0];
  }
  return null;
}

/**
 * Recorre recursivamente el arbol de nodos y extrae los que parecen interactivos.
 * Las coordenadas se normalizan relativas al origen del frame raiz.
 *
 * @param {object} node - Nodo de Figma
 * @param {number} frameOriginX - X absoluto del frame raiz
 * @param {number} frameOriginY - Y absoluto del frame raiz
 * @returns {FigmaNode[]}
 */
function flattenInteractiveNodes(node, frameOriginX, frameOriginY) {
  const result = [];

  function walk(current, depth) {
    if (!current || depth > MAX_TREE_DEPTH) return;

    const bbox = current.absoluteBoundingBox;
    const isInteractive = isLikelyInteractive(current);

    if (isInteractive && bbox && bbox.width >= 20 && bbox.height >= 20) {
      result.push({
        id: current.id,
        name: current.name || "",
        type: current.type || "UNKNOWN",
        x: bbox.x - frameOriginX,
        y: bbox.y - frameOriginY,
        width: bbox.width,
        height: bbox.height,
        transitionNodeID: extractTransitionNodeID(current),
        characters: typeof current.characters === "string" ? current.characters : null
      });
    }

    if (current.children && Array.isArray(current.children)) {
      for (const child of current.children) {
        walk(child, depth + 1);
      }
    }
  }

  walk(node, 0);
  return result;
}

/**
 * Determina si un nodo de Figma es probablemente interactivo.
 * Criterios: tiene transicion, es instancia de componente, nombre sugiere interactividad,
 * o es un frame compacto con nombre explícito (no auto-generado).
 */
function isLikelyInteractive(node) {
  if (!node) return false;

  // Nodos con transiciones son definitivamente interactivos
  if (extractTransitionNodeID(node)) return true;

  const type = (node.type || "").toUpperCase();
  const name = (node.name || "").toLowerCase();

  // Instancias de componentes son usualmente interactivas
  if (type === "INSTANCE") return true;

  // Nombres que sugieren interactividad
  const interactivePatterns = /button|btn|cta|link|tab|nav|icon|card|input|toggle|switch|checkbox|radio|menu|dropdown|chip|badge|avatar|back|close|search|submit|cancel|next|prev|arrow|play|pause/i;
  if (interactivePatterns.test(name)) return true;

  // Frames compactos CON nombre explícito (no auto-generado) parecen botones/controles
  if (type === "FRAME" && node.absoluteBoundingBox) {
    const { width, height } = node.absoluteBoundingBox;
    const isCompact = width >= 24 && width <= 400 && height >= 24 && height <= 100;
    const hasExplicitName = name && !/^(frame|rectangle|group|vector)\s*\d*$/i.test(name);
    if (isCompact && hasExplicitName) {
      return true;
    }
  }

  return false;
}

/**
 * Extrae el transitionNodeID de un nodo Figma.
 * La REST API lo expone en node.transitionNodeID o dentro de reactions[].action.destinationId.
 */
function extractTransitionNodeID(node) {
  if (!node) return null;

  // Campo directo
  if (node.transitionNodeID) return node.transitionNodeID;

  // Dentro de reactions (formato mas completo de la REST API)
  if (node.reactions && Array.isArray(node.reactions)) {
    for (const reaction of node.reactions) {
      const destinationId = reaction.action && reaction.action.destinationId;
      if (destinationId) return destinationId;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Screenshot capture via Figma Images API
// ---------------------------------------------------------------------------

/**
 * Exporta un screenshot de un frame de Figma y lo guarda en el directorio de artifacts.
 *
 * @param {string} fileKey
 * @param {string} nodeId
 * @param {string} accessToken
 * @param {string} runDir - Directorio del run en artifacts/
 * @param {string} runId
 * @param {number} step
 * @returns {Promise<{ screen: string, step: number, src: string } | null>}
 */
export async function getFrameScreenshot(fileKey, nodeId, accessToken, runDir, runId, step) {
  if (!fileKey || !accessToken) return null;

  try {
    const normalizedId = normalizeNodeId(nodeId);
    if (!normalizedId) return null;

    const data = await figmaGet(
      `/images/${fileKey}?ids=${encodeURIComponent(normalizedId)}&format=png&scale=2`,
      accessToken
    );

    if (!data.images) return null;

    const imageUrl = data.images[normalizedId] || Object.values(data.images)[0];
    if (!imageUrl) return null;

    const filename = `step-${String(step).padStart(2, "0")}.png`;
    const absolutePath = path.join(runDir, filename);
    await downloadImage(imageUrl, absolutePath);

    return {
      screen: `Frame ${normalizedId}`,
      step,
      src: `/artifacts/${runId}/${filename}`
    };
  } catch (error) {
    console.error("getFrameScreenshot failed:", error.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Node → Candidate normalization
// ---------------------------------------------------------------------------

/**
 * Transforma nodos de Figma al formato de candidatos que chooseCandidate() consume.
 * Escala las coordenadas del diseno al canvas de visualizacion (360x640 por defecto).
 *
 * @param {FigmaNode[]} nodes
 * @param {number} frameWidth - Ancho del frame en Figma (ej. 375)
 * @param {number} frameHeight - Alto del frame en Figma (ej. 812)
 * @param {number} [targetWidth=360] - Ancho del canvas de visualizacion
 * @param {number} [targetHeight=640] - Alto del canvas de visualizacion
 * @returns {Array<{ text: string, isRestart: boolean, tag: string, x: number, y: number, width: number, height: number, centerX: number, centerY: number, transitionNodeID: string|null }>}
 */
export function nodesToCandidates(nodes, frameWidth, frameHeight, targetWidth = DEFAULT_TARGET_WIDTH, targetHeight = DEFAULT_TARGET_HEIGHT) {
  if (!nodes || !nodes.length) return [];
  if (!frameWidth || !frameHeight) return [];

  const scaleX = targetWidth / frameWidth;
  const scaleY = targetHeight / frameHeight;
  const maxScaledHeight = targetHeight * 0.28;

  return nodes
    .map((node) => {
      const scaledX = node.x * scaleX;
      const scaledY = node.y * scaleY;
      const scaledW = node.width * scaleX;
      const scaledH = node.height * scaleY;

      // Filtro de tamano (alineado con collectCandidates en server.mjs)
      if (scaledW < 24 || scaledH < 24) return null;
      if (scaledX + scaledW < 0 || scaledY + scaledH < 0) return null;
      if (scaledX > targetWidth + 32 || scaledY > targetHeight + 32) return null;
      if (scaledW > targetWidth * 0.96 || scaledH > maxScaledHeight) return null;

      const text = resolveNodeText(node);
      if (text.length > 90) return null;

      return {
        text,
        isRestart: /restart/i.test(text),
        tag: (node.type || "frame").toLowerCase(),
        x: Math.round(scaledX),
        y: Math.round(scaledY),
        width: Math.round(scaledW),
        height: Math.round(scaledH),
        centerX: Math.round(scaledX + scaledW / 2),
        centerY: Math.round(scaledY + scaledH / 2),
        transitionNodeID: node.transitionNodeID || null,
        hasTransition: !!node.transitionNodeID
      };
    })
    .filter(Boolean)
    .slice(0, MAX_CANDIDATES);
}

/**
 * Resuelve el texto legible de un nodo Figma.
 * Prefiere el contenido de texto (characters) sobre el nombre del nodo,
 * y limpia nombres auto-generados tipo "Frame 47".
 */
function resolveNodeText(node) {
  const characters = (typeof node.characters === "string" ? node.characters : "").trim();
  if (characters) return characters;

  const name = (node.name || "").trim();

  // Ignorar nombres auto-generados por Figma
  if (/^(Frame|Rectangle|Group|Vector|Ellipse|Line|Polygon|Star)\s+\d+$/i.test(name)) {
    return "";
  }

  return name;
}

// ---------------------------------------------------------------------------
// Transition resolution
// ---------------------------------------------------------------------------

/**
 * Enriquece los nodos con transitionNodeID via la REST API de Figma.
 * Util cuando la respuesta inicial no incluye datos de transicion.
 *
 * @param {FigmaNode[]} nodes
 * @param {string} fileKey
 * @param {string} accessToken
 * @returns {Promise<FigmaNode[]>}
 */
export async function enrichWithTransitions(nodes, fileKey, accessToken) {
  if (!nodes.length || !fileKey || !accessToken) return nodes;

  const idsToCheck = nodes
    .filter((n) => !n.transitionNodeID)
    .map((n) => n.id)
    .slice(0, MAX_IDS_PER_ENRICHMENT);

  if (!idsToCheck.length) return nodes;

  try {
    const idsParam = idsToCheck.map((id) => encodeURIComponent(id)).join(",");
    const data = await figmaGet(`/files/${fileKey}/nodes?ids=${idsParam}`, accessToken);

    if (!data.nodes) return nodes;

    const transitionMap = new Map();
    for (const [id, entry] of Object.entries(data.nodes)) {
      if (entry.document) {
        const tid = extractTransitionNodeID(entry.document);
        if (tid) transitionMap.set(id, tid);
      }
    }

    return nodes.map((node) => ({
      ...node,
      transitionNodeID: node.transitionNodeID || transitionMap.get(node.id) || null
    }));
  } catch (error) {
    console.error("enrichWithTransitions failed:", error.message);
    return nodes;
  }
}

/**
 * Dado un candidato elegido por chooseCandidate(), encuentra el nodo original
 * que le corresponde y devuelve su transitionNodeID.
 *
 * @param {FigmaNode[]} nodes - Nodos originales (sin escalar)
 * @param {object} chosenPlan - Resultado de chooseCandidate()
 * @param {number} frameWidth
 * @param {number} frameHeight
 * @param {number} [targetWidth=360]
 * @param {number} [targetHeight=640]
 * @returns {string|null} - transitionNodeID del destino
 */
export function findTransitionTarget(nodes, chosenPlan, frameWidth, frameHeight, targetWidth = DEFAULT_TARGET_WIDTH, targetHeight = DEFAULT_TARGET_HEIGHT) {
  if (!nodes || !chosenPlan) return null;

  const planX = chosenPlan.centerX ?? chosenPlan.x;
  const planY = chosenPlan.centerY ?? chosenPlan.y;
  if (planX == null || planY == null) return null;

  const scaleX = targetWidth / Math.max(frameWidth, 1);
  const scaleY = targetHeight / Math.max(frameHeight, 1);

  // Umbral de proximidad proporcional al tamano del canvas
  const proximityThreshold = Math.max(60, Math.sqrt(targetWidth * targetHeight) * 0.12);

  let bestMatch = null;
  let bestDistance = Infinity;

  for (const node of nodes) {
    if (!node.transitionNodeID) continue;

    const nodeCenterX = (node.x + node.width / 2) * scaleX;
    const nodeCenterY = (node.y + node.height / 2) * scaleY;
    const dx = planX - nodeCenterX;
    const dy = planY - nodeCenterY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = node;
    }
  }

  if (bestMatch && bestDistance <= proximityThreshold) {
    return bestMatch.transitionNodeID;
  }

  // Fallback: si el candidato elegido no tenia transicion, buscar el nodo
  // con transicion mas cercano como segunda oportunidad
  if (!bestMatch || bestDistance > proximityThreshold) {
    const nodesWithTransitions = nodes.filter((n) => n.transitionNodeID);
    if (nodesWithTransitions.length > 0) {
      let fallbackNode = null;
      let fallbackDist = Infinity;
      for (const node of nodesWithTransitions) {
        const cx = (node.x + node.width / 2) * scaleX;
        const cy = (node.y + node.height / 2) * scaleY;
        const d = Math.sqrt((planX - cx) ** 2 + (planY - cy) ** 2);
        if (d < fallbackDist) { fallbackDist = d; fallbackNode = node; }
      }
      if (fallbackNode && fallbackDist <= proximityThreshold * 2.5) {
        return { targetId: fallbackNode.transitionNodeID, fallback: true };
      }
    }
  }

  return null;
}

/**
 * Construye un grafo de transiciones a partir de los nodos de un frame.
 * @param {FigmaNode[]} nodes
 * @returns {{ totalNodes: number, connectedNodes: number, transitions: Map<string, string> }}
 */
export function buildTransitionGraph(nodes) {
  const transitions = new Map();
  let connectedNodes = 0;
  for (const node of (nodes || [])) {
    if (node.transitionNodeID) {
      transitions.set(node.id || node.name, node.transitionNodeID);
      connectedNodes += 1;
    }
  }
  return { totalNodes: (nodes || []).length, connectedNodes, transitions };
}

// ---------------------------------------------------------------------------
// Token & availability check
// ---------------------------------------------------------------------------

/**
 * Verifica si el token de Figma es valido haciendo un request de prueba.
 * @param {string} accessToken
 * @returns {Promise<boolean>}
 */
export async function checkFigmaAvailability(accessToken) {
  if (!accessToken) return false;
  try {
    await figmaGet("/me", accessToken);
    return true;
  } catch (error) {
    return false;
  }
}
