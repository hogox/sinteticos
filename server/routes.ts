import path from "node:path";
import { PROJECT_ROOT } from "./config.ts";
import { checkFigmaAvailability } from "../figma-mcp-client.ts";
import { generatePersonas, extractPersonas, generatePersonaChatReply } from "./anthropic.ts";
import { parseMultipart, MAX_TOTAL_BYTES } from "./multipart.ts";
import { parseFile, fetchAndParseUrl } from "./parsers.ts";
import { loadSkillRegistry, listSkills, getSkill } from "../skills/_runtime/loader.ts";
import { runSkill, getRuntimeStatus } from "../skills/_runtime/executor.ts";

export function createRouteHandler(deps) {
  const { readState, writeState, readJson, serveFile, sendJson, uid, safeExecuteRun, getPlaywright, buildInitialState } = deps;

  return async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (url.pathname === "/api/health" && req.method === "GET") {
        const playwright = await getPlaywright();
        const figmaToken = process.env.FIGMA_ACCESS_TOKEN || "";
        const figmaAvailable = figmaToken ? await checkFigmaAvailability(figmaToken) : false;
        const skillsStatus = await getRuntimeStatus();
        return sendJson(res, 200, {
          ok: true,
          runner: playwright ? "playwright-ready" : "simulated-fallback",
          mcp: figmaAvailable ? "figma-mcp-ready" : "optional",
          figma_mcp: figmaAvailable,
          skills: skillsStatus
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
          context: payload.context || null,
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
        } catch (error: any) {
          const status = error.code === "ANTHROPIC_KEY_MISSING" ? 503 : error.code === "INVALID_INPUT" ? 400 : 502;
          return sendJson(res, status, { error: error.message, code: error.code || "ANTHROPIC_ERROR" });
        }
      }

      if (url.pathname === "/api/personas/ai-extract" && req.method === "POST") {
        const payload = await readJson(req);
        try {
          const personas = await extractPersonas(payload.source_text, payload.quantity);
          return sendJson(res, 200, { personas });
        } catch (error: any) {
          const status = error.code === "ANTHROPIC_KEY_MISSING" ? 503 : error.code === "INVALID_INPUT" ? 400 : 502;
          return sendJson(res, status, { error: error.message, code: error.code || "ANTHROPIC_ERROR" });
        }
      }

      if (url.pathname === "/api/personas/ai-extract-multi" && req.method === "POST") {
        try {
          const { files, fields } = (await parseMultipart(req)) as { files: any[]; fields: any };
          const quantity = Number(fields.quantity) || 3;
          const pastedText = String(fields.text || fields.pasted_text || "").trim();
          const urlsRaw = fields.urls || [];
          const urls = (Array.isArray(urlsRaw) ? urlsRaw : [urlsRaw])
            .flatMap((entry) => String(entry || "").split(/\r?\n/))
            .map((u) => u.trim())
            .filter(Boolean);

          if (!files.length && !urls.length && !pastedText) {
            return sendJson(res, 400, { error: "No hay fuentes para procesar (archivos, URLs ni texto).", code: "NO_SOURCES" });
          }

          // Procesar archivos y URLs en paralelo, capturando errores por fuente sin abortar el batch.
          const fileResults = await Promise.all(
            files.map(async (file) => {
              try {
                const parsed = await parseFile(file);
                return { ok: true, ...parsed };
              } catch (error: any) {
                return { ok: false, source: file.filename, kind: "file", error: error.message };
              }
            })
          );

          const urlResults = await Promise.all(
            urls.map(async (link) => {
              try {
                const parsed = await fetchAndParseUrl(link);
                return {
                  ok: true,
                  source: parsed.url,
                  kind: "url",
                  text: parsed.text,
                  meta: { title: parsed.title, status: parsed.status }
                };
              } catch (error: any) {
                return { ok: false, source: link, kind: "url", error: error.message };
              }
            })
          );

          const sources: any[] = [...fileResults, ...urlResults];
          if (pastedText) {
            sources.push({ ok: true, source: "texto pegado", kind: "text", text: pastedText, meta: { bytes: pastedText.length } });
          }

          const successful = sources.filter((s) => s.ok && s.text);
          const failed = sources.filter((s) => !s.ok);

          if (!successful.length) {
            return sendJson(res, 400, {
              error: "No se pudo procesar ninguna fuente.",
              code: "ALL_SOURCES_FAILED",
              sources
            });
          }

          // Concatenar todo con headers reconocibles para el modelo.
          const concatenated = successful
            .map((src) => {
              const label = src.kind === "url" ? `url: ${src.source}` : `archivo: ${src.source}`;
              return `--- ${label} ---\n${src.text}`;
            })
            .join("\n\n");

          // Limitar tamaño total enviado al modelo (~5MB texto)
          const truncated = concatenated.length > MAX_TOTAL_BYTES
            ? concatenated.slice(0, MAX_TOTAL_BYTES)
            : concatenated;

          const personas = await extractPersonas(truncated, quantity);
          return sendJson(res, 200, {
            personas,
            sources: sources.map((s) => ({
              ok: s.ok,
              kind: s.kind,
              source: s.source,
              ...(s.meta ? { meta: s.meta } : {}),
              ...(s.error ? { error: s.error } : {})
            })),
            stats: {
              total_sources: sources.length,
              successful: successful.length,
              failed: failed.length,
              chars: truncated.length
            }
          });
        } catch (error: any) {
          const status = error.status || (error.code === "ANTHROPIC_KEY_MISSING" ? 503 : error.code === "INVALID_INPUT" ? 400 : 502);
          return sendJson(res, status, { error: error.message, code: error.code || "MULTI_EXTRACT_ERROR" });
        }
      }

      if (url.pathname === "/api/personas" && req.method === "POST") {
        const payload = await readJson(req);
        const state = await readState();
        const now = new Date().toISOString();
        // Personas son top-level: ignoramos project_id si llega del cliente.
        const { project_id: _ignored, ...rest } = payload || {};
        state.personas.unshift({
          id: uid("persona"),
          ...rest,
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
      const personaConversationsMatch = url.pathname.match(/^\/api\/personas\/([^/]+)\/conversations$/);
      const personaConversationMessagesMatch = url.pathname.match(/^\/api\/personas\/([^/]+)\/conversations\/([^/]+)\/messages$/);
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
                context: payload.context !== undefined ? payload.context : item.context,
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
        // Las personas son top-level: sobreviven al borrado del proyecto.
        // Cascada: tasks, runs, calibrations y conversations cuyo project_id matchee.
        const taskIds = state.tasks.filter((item) => item.project_id === projectId).map((item) => item.id);
        state.projects = state.projects.filter((item) => item.id !== projectId);
        state.tasks = state.tasks.filter((item) => item.project_id !== projectId);
        state.calibrations = state.calibrations.filter((item) => item.project_id !== projectId);
        state.persona_conversations = (state.persona_conversations || []).filter((item) => item.project_id !== projectId);
        state.runs = state.runs.filter(
          (item) => item.project_id !== projectId && !taskIds.includes(item.task_id)
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
        state.persona_conversations = (state.persona_conversations || []).filter((item) => item.persona_id !== personaMatch[1]);
        await writeState(state);
        return sendJson(res, 200, { state });
      }

      if (personaConversationsMatch && req.method === "POST") {
        const state = await readState();
        const persona = state.personas.find((item) => item.id === personaConversationsMatch[1]);
        if (!persona) {
          return sendJson(res, 404, { error: "Persona not found" });
        }
        const payload = await readJson(req);
        const now = new Date().toISOString();
        const kind = payload.kind === "hypothesis" ? "hypothesis" : "chat";
        const conversation = {
          id: uid("thread"),
          project_id: payload.project_id || null,
          persona_id: persona.id,
          kind,
          title: payload.title || (kind === "hypothesis" ? "Hipótesis sin título" : "Chat principal"),
          mode: payload.mode === "evidence" ? "evidence" : "free",
          anchor_run_id: payload.anchorRunId || null,
          messages: [],
          created_at: now,
          updated_at: now
        };
        state.persona_conversations = [conversation, ...(state.persona_conversations || [])];
        await writeState(state);
        return sendJson(res, 200, { state, conversation });
      }

      if (personaConversationMessagesMatch && req.method === "POST") {
        const state = await readState();
        const personaId = personaConversationMessagesMatch[1];
        const threadId = personaConversationMessagesMatch[2];
        const persona = state.personas.find((item) => item.id === personaId);
        const thread = (state.persona_conversations || []).find((item) => item.id === threadId && item.persona_id === personaId);
        if (!persona || !thread) {
          return sendJson(res, 404, { error: "Conversation not found" });
        }
        const payload = await readJson(req);
        const content = String(payload.content || "").trim();
        if (!content) {
          return sendJson(res, 400, { error: "Message is empty" });
        }
        const mode = payload.mode === "evidence" ? "evidence" : thread.mode || "free";
        const anchorRunId = payload.anchorRunId || thread.anchor_run_id || null;
        const project = thread.project_id ? state.projects.find((item) => item.id === thread.project_id) || null : null;
        const tasks = state.tasks.filter((item) => item.persona_id === persona.id);
        const runs = state.runs.filter((item) => item.persona_id === persona.id);
        const now = new Date().toISOString();
        const userMessage = {
          id: uid("msg"),
          role: "user",
          content,
          created_at: now
        };
        const reply = await generatePersonaChatReply({
          persona,
          project,
          tasks,
          runs,
          thread,
          message: content,
          mode,
          anchorRunId,
          kind: thread.kind || "chat"
        });
        const personaMessage = {
          id: uid("msg"),
          role: "persona",
          content: reply.reply,
          evidence_mode: reply.evidence_mode,
          reasoning_note: reply.reasoning_note,
          citations: reply.citations,
          verdict: (reply as any).verdict || null,
          verdict_reason: (reply as any).verdict_reason || null,
          conditions: (reply as any).conditions || null,
          frictions: (reply as any).frictions || null,
          created_at: new Date().toISOString()
        };
        // Auto-titular hipótesis con la primera pregunta del usuario.
        const isFirstMessage = (thread.messages || []).length === 0;
        const newTitle =
          thread.kind === "hypothesis" && isFirstMessage
            ? content.slice(0, 70)
            : thread.title;
        state.persona_conversations = (state.persona_conversations || []).map((item) =>
          item.id === thread.id
            ? {
                ...item,
                mode,
                anchor_run_id: anchorRunId,
                title: newTitle,
                messages: [...item.messages, userMessage, personaMessage],
                updated_at: personaMessage.created_at
              }
            : item
        );
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

        const project = state.projects.find((item) => item.id === task.project_id) || null;
        const runCount = Math.max(1, Math.min(8, Number(payload.runCount) || 1));
        const runs = [];
        for (let index = 0; index < runCount; index += 1) {
          runs.push(await safeExecuteRun(task, persona, index + 1, { project }));
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

      if (runMatch && req.method === "PATCH") {
        const state = await readState();
        const payload = await readJson(req);
        if (!payload || typeof payload.feedback !== "object") {
          return sendJson(res, 400, { error: "feedback object required" });
        }
        const allowedTags = ["robotico", "muy optimista", "no entiende el dominio", "perfecto", "comportamiento raro", "muy realista"];
        const cleanFeedback = {
          rating: Math.max(1, Math.min(5, Number(payload.feedback.rating) || 0)) || null,
          tags: Array.isArray(payload.feedback.tags) ? payload.feedback.tags.filter((t) => allowedTags.includes(t)) : [],
          comment: String(payload.feedback.comment || "").slice(0, 500),
          rated_at: new Date().toISOString()
        };
        state.runs = state.runs.map((item) =>
          item.id === runMatch[1] ? { ...item, feedback: cleanFeedback } : item
        );
        await writeState(state);
        return sendJson(res, 200, { state });
      }

      if (url.pathname === "/api/skills" && req.method === "GET") {
        const registry = await loadSkillRegistry();
        return sendJson(res, 200, { skills: listSkills(registry) });
      }

      const analysisMatch = url.pathname.match(/^\/api\/analyses\/([^/]+)$/);
      if (analysisMatch && req.method === "PATCH") {
        const state = await readState();
        const payload = await readJson(req);
        if (!payload || typeof payload.feedback !== "object") {
          return sendJson(res, 400, { error: "feedback object required" });
        }
        const cleanFeedback = {
          helpful: typeof payload.feedback.helpful === "boolean" ? payload.feedback.helpful : null,
          accuracy: Math.max(1, Math.min(5, Number(payload.feedback.accuracy) || 0)) || null,
          surprised_me: Boolean(payload.feedback.surprised_me),
          comment: String(payload.feedback.comment || "").slice(0, 500),
          rated_at: new Date().toISOString()
        };
        state.run_analyses = (state.run_analyses || []).map((item) =>
          item.id === analysisMatch[1] ? { ...item, feedback: cleanFeedback } : item
        );
        await writeState(state);
        return sendJson(res, 200, { state });
      }

      const skillRunMatch = url.pathname.match(/^\/api\/skills\/([^/]+)\/run$/);
      if (skillRunMatch && req.method === "POST") {
        const skillName = skillRunMatch[1];
        const registry = await loadSkillRegistry();
        const skill = getSkill(registry, skillName);
        if (!skill) {
          return sendJson(res, 404, { error: `Skill no encontrado: ${skillName}` });
        }
        const payload = await readJson(req);
        const state = await readState();
        const runIds = Array.isArray(payload.run_ids) ? payload.run_ids : [];
        const runs = runIds.map((rid) => state.runs.find((r) => r.id === rid)).filter(Boolean);
        if (!runs.length) {
          return sendJson(res, 400, { error: "No se encontraron runs con los IDs proporcionados." });
        }
        const personaId = payload.persona_id || runs[0].persona_id;
        const taskId = payload.task_id || runs[0].task_id;
        const persona = state.personas.find((p) => p.id === personaId) || null;
        const task = state.tasks.find((t) => t.id === taskId) || null;
        const project = state.projects.find((p) => p.id === (task?.project_id || runs[0].project_id)) || null;
        const calibrations = (state.calibrations || []).filter((c) => c.persona_id === personaId);
        try {
          const result = await runSkill(skillName, { runs, persona, task, project, calibrations }, { provider: payload.provider || undefined });
          if (result.ok && url.searchParams.get("persist") !== "false") {
            state.run_analyses = state.run_analyses || [];
            const analysisId = uid("analysis");
            state.run_analyses.unshift({
              id: analysisId,
              run_ids: runIds,
              skill: skillName,
              output: result.output,
              provider: result.provider,
              model: result.model,
              latency_ms: result.latency_ms,
              created_at: new Date().toISOString()
            });
            await writeState(state);
            (result as any).analysis_id = analysisId;
          }
          return sendJson(res, 200, result);
        } catch (error: any) {
          const status = error.code === "PROVIDER_KEY_MISSING" || error.code === "NO_PROVIDER" ? 503 : 502;
          return sendJson(res, status, { ok: false, error: error.message, code: error.code || "SKILL_ERROR" });
        }
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
    } catch (error: any) {
      return sendJson(res, 500, { error: error.message });
    }
  };
}
