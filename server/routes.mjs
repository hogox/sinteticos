import path from "node:path";
import { PROJECT_ROOT } from "./config.mjs";
import { checkFigmaAvailability } from "../figma-mcp-client.mjs";
import { generatePersonas, extractPersonas } from "./anthropic.mjs";

export function createRouteHandler(deps) {
  const { readState, writeState, readJson, serveFile, sendJson, uid, safeExecuteRun, getPlaywright, buildInitialState } = deps;

  return async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (url.pathname === "/api/health" && req.method === "GET") {
        const playwright = await getPlaywright();
        const figmaToken = process.env.FIGMA_ACCESS_TOKEN || "";
        const figmaAvailable = figmaToken ? await checkFigmaAvailability(figmaToken) : false;
        return sendJson(res, 200, {
          ok: true,
          runner: playwright ? "playwright-ready" : "simulated-fallback",
          mcp: figmaAvailable ? "figma-mcp-ready" : "optional",
          figma_mcp: figmaAvailable
        });
      }

      if (url.pathname === "/api/state" && req.method === "GET") {
        return sendJson(res, 200, { state: await readState() });
      }

      if (url.pathname === "/api/demo/reset" && req.method === "POST") {
        const state = buildInitialState();
        await writeState(state);
        return sendJson(res, 200, { state });
      }

      if (url.pathname === "/api/projects" && req.method === "POST") {
        const payload = await readJson(req);
        const state = await readState();
        const now = new Date().toISOString();
        state.projects.unshift({
          id: uid("project"),
          name: payload.name || "Proyecto sin nombre",
          description: payload.description || "",
          created_at: now,
          updated_at: now
        });
        await writeState(state);
        return sendJson(res, 200, { state });
      }

      if (url.pathname === "/api/personas/ai-generate" && req.method === "POST") {
        const payload = await readJson(req);
        try {
          const personas = await generatePersonas(payload.description, payload.quantity);
          return sendJson(res, 200, { personas });
        } catch (error) {
          const status = error.code === "ANTHROPIC_KEY_MISSING" ? 503 : error.code === "INVALID_INPUT" ? 400 : 502;
          return sendJson(res, status, { error: error.message, code: error.code || "ANTHROPIC_ERROR" });
        }
      }

      if (url.pathname === "/api/personas/ai-extract" && req.method === "POST") {
        const payload = await readJson(req);
        try {
          const personas = await extractPersonas(payload.source_text, payload.quantity);
          return sendJson(res, 200, { personas });
        } catch (error) {
          const status = error.code === "ANTHROPIC_KEY_MISSING" ? 503 : error.code === "INVALID_INPUT" ? 400 : 502;
          return sendJson(res, status, { error: error.message, code: error.code || "ANTHROPIC_ERROR" });
        }
      }

      if (url.pathname === "/api/personas" && req.method === "POST") {
        const payload = await readJson(req);
        const state = await readState();
        const now = new Date().toISOString();
        state.personas.unshift({
          id: uid("persona"),
          ...payload,
          project_id: payload.project_id,
          status: "active",
          version: 1,
          created_at: now,
          updated_at: now
        });
        await writeState(state);
        return sendJson(res, 200, { state });
      }

      if (url.pathname === "/api/tasks" && req.method === "POST") {
        const payload = await readJson(req);
        const state = await readState();
        const now = new Date().toISOString();
        state.tasks.unshift({
          id: uid("task"),
          ...payload,
          project_id: payload.project_id,
          status: "ready",
          created_at: now,
          updated_at: now
        });
        await writeState(state);
        return sendJson(res, 200, { state });
      }

      if (url.pathname === "/api/calibrations" && req.method === "POST") {
        const payload = await readJson(req);
        const state = await readState();
        state.calibrations.unshift({
          id: uid("calibration"),
          ...payload,
          project_id: payload.project_id,
          created_at: new Date().toISOString()
        });
        await writeState(state);
        return sendJson(res, 200, { state });
      }

      const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
      const personaMatch = url.pathname.match(/^\/api\/personas\/([^/]+)$/);
      const personaDuplicateMatch = url.pathname.match(/^\/api\/personas\/([^/]+)\/duplicate$/);
      const personaArchiveMatch = url.pathname.match(/^\/api\/personas\/([^/]+)\/archive$/);
      const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
      const taskRunsMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/runs$/);
      const runMatch = url.pathname.match(/^\/api\/runs\/([^/]+)$/);

      if (projectMatch && req.method === "PATCH") {
        const state = await readState();
        const payload = await readJson(req);
        state.projects = state.projects.map((item) =>
          item.id === projectMatch[1]
            ? {
                ...item,
                name: payload.name ?? item.name,
                description: payload.description ?? item.description,
                updated_at: new Date().toISOString()
              }
            : item
        );
        await writeState(state);
        return sendJson(res, 200, { state });
      }

      if (projectMatch && req.method === "DELETE") {
        const state = await readState();
        const projectId = projectMatch[1];
        const taskIds = state.tasks.filter((item) => item.project_id === projectId).map((item) => item.id);
        const personaIds = state.personas.filter((item) => item.project_id === projectId).map((item) => item.id);
        state.projects = state.projects.filter((item) => item.id !== projectId);
        state.personas = state.personas.filter((item) => item.project_id !== projectId);
        state.tasks = state.tasks.filter((item) => item.project_id !== projectId);
        state.calibrations = state.calibrations.filter((item) => item.project_id !== projectId);
        state.runs = state.runs.filter(
          (item) => item.project_id !== projectId && !taskIds.includes(item.task_id) && !personaIds.includes(item.persona_id)
        );
        await writeState(state);
        return sendJson(res, 200, { state });
      }

      if (personaMatch && req.method === "PATCH") {
        const state = await readState();
        const payload = await readJson(req);
        state.personas = state.personas.map((item) =>
          item.id === personaMatch[1] ? { ...item, ...payload, version: item.version + 1, updated_at: new Date().toISOString() } : item
        );
        await writeState(state);
        return sendJson(res, 200, { state });
      }

      if (personaMatch && req.method === "DELETE") {
        const state = await readState();
        state.personas = state.personas.filter((item) => item.id !== personaMatch[1]);
        await writeState(state);
        return sendJson(res, 200, { state });
      }

      if (personaDuplicateMatch && req.method === "POST") {
        const state = await readState();
        const base = state.personas.find((item) => item.id === personaDuplicateMatch[1]);
        if (!base) {
          return sendJson(res, 404, { error: "Persona not found" });
        }
        state.personas.unshift({
          ...base,
          id: uid("persona"),
          name: `${base.name} Copy`,
          status: "draft",
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        await writeState(state);
        return sendJson(res, 200, { state });
      }

      if (personaArchiveMatch && req.method === "POST") {
        const state = await readState();
        state.personas = state.personas.map((item) =>
          item.id === personaArchiveMatch[1]
            ? { ...item, status: item.status === "archived" ? "active" : "archived", updated_at: new Date().toISOString() }
            : item
        );
        await writeState(state);
        return sendJson(res, 200, { state });
      }

      if (taskMatch && req.method === "PATCH") {
        const state = await readState();
        const payload = await readJson(req);
        state.tasks = state.tasks.map((item) =>
          item.id === taskMatch[1] ? { ...item, ...payload, updated_at: new Date().toISOString() } : item
        );
        await writeState(state);
        return sendJson(res, 200, { state });
      }

      if (taskMatch && req.method === "DELETE") {
        const state = await readState();
        state.tasks = state.tasks.filter((item) => item.id !== taskMatch[1]);
        await writeState(state);
        return sendJson(res, 200, { state });
      }

      if (taskRunsMatch && req.method === "POST") {
        const state = await readState();
        const task = state.tasks.find((item) => item.id === taskRunsMatch[1]);
        if (!task) {
          return sendJson(res, 404, { error: "Task not found" });
        }

        const payload = await readJson(req);
        const persona = state.personas.find((item) => item.id === payload.personaId) || state.personas.find((item) => item.id === task.persona_id);
        if (!persona) {
          return sendJson(res, 404, { error: "Persona not found" });
        }

        const runCount = Math.max(1, Math.min(8, Number(payload.runCount) || 1));
        const runs = [];
        for (let index = 0; index < runCount; index += 1) {
          runs.push(await safeExecuteRun(task, persona, index + 1));
        }
        state.runs = [...runs.reverse(), ...state.runs];
        await writeState(state);
        return sendJson(res, 200, { state });
      }

      if (runMatch && req.method === "DELETE") {
        const state = await readState();
        state.runs = state.runs.filter((item) => item.id !== runMatch[1]);
        await writeState(state);
        return sendJson(res, 200, { state });
      }

      if (url.pathname.startsWith("/artifacts/")) {
        return serveFile(res, path.join(PROJECT_ROOT, decodeURIComponent(url.pathname)));
      }

      if (url.pathname.startsWith("/src/") || url.pathname.startsWith("/shared/")) {
        const allowedExtensions = [".js", ".mjs", ".css", ".html"];
        const ext = path.extname(url.pathname);
        if (allowedExtensions.includes(ext)) {
          return serveFile(res, path.join(PROJECT_ROOT, decodeURIComponent(url.pathname)));
        }
        return sendJson(res, 403, { error: "Forbidden file type" });
      }

      if (url.pathname === "/" || url.pathname === "/index.html") {
        return serveFile(res, path.join(PROJECT_ROOT, "index.html"));
      }

      if (url.pathname === "/styles.css") {
        return serveFile(res, path.join(PROJECT_ROOT, "styles.css"));
      }

      if (url.pathname === "/app.js") {
        return serveFile(res, path.join(PROJECT_ROOT, "app.js"));
      }

      return sendJson(res, 404, { error: "Not found" });
    } catch (error) {
      return sendJson(res, 500, { error: error.message });
    }
  };
}
