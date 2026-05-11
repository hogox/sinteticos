import path from "node:path";
import { promises as fs } from "node:fs";
import { DATA_DIR, ARTIFACTS_DIR, STATE_FILE } from "./config.ts";
import { uid } from "./utils.ts";

export async function ensurePaths() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
}

export async function ensureState(buildInitialState) {
  try {
    await fs.access(STATE_FILE);
  } catch (error: any) {
    await writeState(buildInitialState());
  }
}

export async function readState() {
  const raw = await fs.readFile(STATE_FILE, "utf8");
  const parsed = JSON.parse(raw);
  const migrated = migrateState(parsed);
  if (migrated.changed) {
    await writeState(migrated.state);
  }
  return migrated.state;
}

export async function writeState(state) {
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

export async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export async function serveFile(res, filePath) {
  const contents = await fs.readFile(filePath);
  const ext = path.extname(filePath);
  const type =
    ext === ".html"
      ? "text/html; charset=utf-8"
      : ext === ".css"
        ? "text/css; charset=utf-8"
        : ext === ".js" || ext === ".mjs"
          ? "application/javascript; charset=utf-8"
          : ext === ".png"
            ? "image/png"
            : ext === ".jpg" || ext === ".jpeg"
              ? "image/jpeg"
              : ext === ".webp"
                ? "image/webp"
                : ext === ".gif"
                  ? "image/gif"
                  : "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(contents);
}

export function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

export function migrateState(state) {
  const next = {
    projects: Array.isArray(state.projects) ? [...state.projects] : [],
    personas: Array.isArray(state.personas) ? [...state.personas] : [],
    tasks: Array.isArray(state.tasks) ? [...state.tasks] : [],
    runs: Array.isArray(state.runs) ? [...state.runs] : [],
    calibrations: Array.isArray(state.calibrations) ? [...state.calibrations] : [],
    persona_conversations: Array.isArray(state.persona_conversations) ? [...state.persona_conversations] : []
  };
  let changed = !Array.isArray(state.projects) || !Array.isArray(state.persona_conversations);
  const now = new Date().toISOString();

  if (!next.projects.length && (next.personas.length || next.tasks.length || next.runs.length || next.calibrations.length)) {
    next.projects.push({
      id: uid("project"),
      name: "Proyecto migrado",
      description: "Proyecto creado automaticamente para conservar datos existentes del laboratorio.",
      created_at: now,
      updated_at: now
    });
    changed = true;
  }

  const fallbackProjectId = next.projects[0] ? next.projects[0].id : null;
  const taskProjectMap = new Map(next.tasks.map((item) => [item.id, item.project_id || fallbackProjectId]));
  const personaProjectMap = new Map(next.personas.map((item) => [item.id, item.project_id || fallbackProjectId]));

  // Personas son top-level: si vienen con project_id legacy, lo eliminamos.
  next.personas = next.personas.map((item) => {
    if (!("project_id" in item)) return item;
    changed = true;
    const { project_id, ...rest } = item;
    return rest;
  });

  next.tasks = next.tasks.map((item) => {
    if (item.project_id) return item;
    changed = true;
    return { ...item, project_id: item.persona_id ? personaProjectMap.get(item.persona_id) || fallbackProjectId : fallbackProjectId };
  });

  next.calibrations = next.calibrations.map((item) => {
    if (item.project_id) return item;
    changed = true;
    return {
      ...item,
      project_id:
        (item.task_id && taskProjectMap.get(item.task_id)) ||
        (item.persona_id && personaProjectMap.get(item.persona_id)) ||
        fallbackProjectId
    };
  });

  next.runs = next.runs.map((item) => {
    if (item.project_id) return item;
    changed = true;
    return {
      ...item,
      project_id:
        (item.task_id && taskProjectMap.get(item.task_id)) ||
        (item.persona_id && personaProjectMap.get(item.persona_id)) ||
        fallbackProjectId
    };
  });

  // project_id ahora es opcional (chats sueltos para validar hipótesis).
  next.persona_conversations = next.persona_conversations
    .filter((item) => item && item.persona_id)
    .map((item) => ({
      ...item,
      project_id: item.project_id || null,
      kind: item.kind === "hypothesis" ? "hypothesis" : "chat",
      mode: item.mode === "evidence" ? "evidence" : "free",
      anchor_run_id: item.anchor_run_id || null,
      messages: Array.isArray(item.messages) ? item.messages : [],
      updated_at: item.updated_at || item.created_at || now,
      created_at: item.created_at || now
    }));

  next.projects = next.projects.map((item) => ({
    ...item,
    updated_at: item.updated_at || item.created_at || now,
    created_at: item.created_at || now
  }));

  return { state: next, changed };
}
