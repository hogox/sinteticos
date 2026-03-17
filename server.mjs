import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "data");
const ARTIFACTS_DIR = path.join(__dirname, "artifacts");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const PORT = Number(process.env.PORT || 8787);
const DEFAULT_RUN_TIMEOUT_MS = 25000;
const DEFAULT_SURFACE_TIMEOUT_MS = 8000;
const DEFAULT_FIGMA_INTERACTIVE_WAIT_MS = 1200;
const DEFAULT_INITIAL_WAIT_MS = 1200;
const DEFAULT_PAGE_ACTION_TIMEOUT_MS = 3500;
const DEFAULT_PAGE_NAVIGATION_TIMEOUT_MS = 12000;
const DEFAULT_GOTO_TIMEOUT_MS = 20000;
const DEFAULT_STARTUP_GRACE_MS = 0;
const VISUAL_FRAME_DETECTION_TIMEOUT_MS = 1800;
const DEFAULT_BLIND_WAKE_POINTS = [
  { x: 0.5, y: 0.52, label: "center" },
  { x: 0.5, y: 0.8, label: "lower-center" },
  { x: 0.5, y: 0.24, label: "upper-center" },
  { x: 0.28, y: 0.52, label: "left-mid" },
  { x: 0.72, y: 0.52, label: "right-mid" }
];

let playwrightModulePromise;
const execFile = promisify(execFileCallback);

await ensurePaths();
await ensureState();

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception in Sinteticos Lab:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection in Sinteticos Lab:", reason);
});

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/health" && req.method === "GET") {
      const playwright = await getPlaywright();
      return sendJson(res, 200, {
        ok: true,
        runner: playwright ? "playwright-ready" : "simulated-fallback",
        mcp: "optional"
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
      return serveFile(res, path.join(__dirname, decodeURIComponent(url.pathname)));
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return serveFile(res, path.join(__dirname, "index.html"));
    }

    if (url.pathname === "/styles.css") {
      return serveFile(res, path.join(__dirname, "styles.css"));
    }

    if (url.pathname === "/app.js") {
      return serveFile(res, path.join(__dirname, "app.js"));
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Sinteticos Lab running on http://localhost:${PORT}`);
});

async function executeRun(task, persona, iteration) {
  if (task.type === "navigation" && task.url) {
    return executeNavigationRun(task, persona, iteration);
  }
  return simulateRun(task, persona, iteration, { engine: "server-simulated", source: "server" });
}

async function safeExecuteRun(task, persona, iteration) {
  try {
    return await executeRun(task, persona, iteration);
  } catch (error) {
    console.error("Run failed and was converted to persisted error run:", error);
    return buildErrorRun(task, persona, iteration, error);
  }
}

async function executeNavigationRun(task, persona, iteration) {
  const playwright = await getPlaywright();
  if (!playwright) {
    return simulateRun(task, persona, iteration, {
      engine: "server-simulated",
      source: "server",
      execution_notes: "Playwright no esta instalado. Se uso fallback simulado."
    });
  }

  const runId = uid("run");
  const startedAt = new Date();
  const seed = hashString(`${task.id}:${persona.id}:${iteration}:${startedAt.toISOString()}`).toString().slice(0, 6);
  const rng = mulberry32(Number(seed));
  const stepLog = [];
  const clickPoints = [];
  const screenTransitions = [];
  const screenshots = [];
  const debugArtifacts = [];
  const runDir = path.join(ARTIFACTS_DIR, runId);
  await fs.mkdir(runDir, { recursive: true });
  const timing = resolveNavigationTiming(task);
  const deadline = Date.now() + timing.runTimeoutMs;
  const context = {
    currentScreen: "Run bootstrap",
    screenshots,
    stepLog,
    clickPoints,
    screenTransitions,
    interactionFrame: null,
    debugArtifacts,
    viewport: null
  };

  let browser;
  let completionStatus = "completed";
  let executionNotes = "Navegacion real con Playwright.";
  let usedBlindWake = false;

  try {
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    context.page = page;
    context.viewport = page.viewportSize();
    page.setDefaultTimeout(timing.pageActionTimeoutMs);
    page.setDefaultNavigationTimeout(timing.pageNavigationTimeoutMs);
    await page.goto(task.url, { waitUntil: "domcontentloaded", timeout: timing.gotoTimeoutMs });
    await page.waitForTimeout(timing.initialWaitMs);
    let initialSurface = await settleFigmaSurface(page, deadline, timing, task);
    if (initialSurface.kind === "login-wall") {
      return buildBlockedRun(task, persona, startedAt, seed, runId, rng, "Llegue a una pantalla de acceso o registro y no pude entrar al prototipo real.", "El prototipo quedo bloqueado por la capa de acceso de Figma. Se necesita una URL mas publica o permisos distintos.", runDir, page);
    }
    if (initialSurface.kind === "timeout") {
      const blindWake = await attemptBlindWakeSequence(page, task, deadline, timing);
      if (blindWake.kind === "login-wall") {
        return buildBlockedRun(task, persona, startedAt, seed, runId, rng, "Llegue a una pantalla de acceso o registro y no pude entrar al prototipo real.", "El prototipo quedo bloqueado por la capa de acceso de Figma. Se necesita una URL mas publica o permisos distintos.", runDir, page);
      }
      if (blindWake.kind !== "ready") {
        return buildBlockedRun(task, persona, startedAt, seed, runId, rng, "La pantalla quedo cargando demasiado tiempo y no aparecio un estado usable del prototipo.", "El prototipo quedo en loading o restart demasiado tiempo. El run se cerro para no quedarse colgado.", runDir, page);
      }
      usedBlindWake = true;
      executionNotes = "Navegacion real con Playwright. Se uso blind wake experimental para intentar activar el prototipo.";
      context.interactionFrame = blindWake.frame || null;
      initialSurface = { kind: "clear" };
    }
    const startupExtension = await extendFigmaStartupWindow(page, task, deadline, timing);
    if (startupExtension.kind === "timeout") {
      const blindWake = await attemptBlindWakeSequence(page, task, deadline, timing);
      if (blindWake.kind === "login-wall") {
        return buildBlockedRun(task, persona, startedAt, seed, runId, rng, "Llegue a una pantalla de acceso o registro y no pude entrar al prototipo real.", "El prototipo quedo bloqueado por la capa de acceso de Figma. Se necesita una URL mas publica o permisos distintos.", runDir, page);
      }
      if (blindWake.kind !== "ready") {
        return buildBlockedRun(task, persona, startedAt, seed, runId, rng, "La pantalla inicial del prototipo no termino de activarse dentro del tiempo extendido de espera.", "El prototipo quedo demasiado tiempo en una pantalla inicial estatica y el run se cerro para no quedarse colgado.", runDir, page);
      }
      usedBlindWake = true;
      executionNotes = "Navegacion real con Playwright. Se uso blind wake experimental para intentar activar el prototipo.";
      context.interactionFrame = blindWake.frame || null;
    }
    context.interactionFrame = context.interactionFrame || (await getInteractionFrame(page, task));
    let previousFingerprint = await safeFingerprintPage(page);
    let currentScreen = await safeGetScreenLabel(page, 1);
    context.currentScreen = currentScreen;
    await safeCaptureScreenshot(page, runDir, screenshots, currentScreen, 1, runId);
    if (context.interactionFrame) {
      await writeFrameDebugArtifact(runDir, runId, currentScreen, context.interactionFrame, debugArtifacts, page.viewportSize());
    }

    for (let step = 1; step <= task.max_steps; step += 1) {
      if (Date.now() >= deadline) {
        completionStatus = "abandoned";
        executionNotes = "El run alcanzo el timeout maximo antes de completar la navegacion.";
        stepLog.push({
          step,
          screen: currentScreen,
          action: "abandon",
          reason: "La experiencia siguio cargando o sin cambio suficiente durante demasiado tiempo.",
          certainty: 22,
          timestamp: new Date().toISOString()
        });
        await safeCaptureScreenshot(page, runDir, screenshots, currentScreen, step + 1, runId);
        break;
      }

      const guardrailStatus = await settleFigmaSurface(page, deadline, timing, task);
      if (guardrailStatus.kind === "login-wall") {
        completionStatus = "abandoned";
        executionNotes = "El prototipo quedo bloqueado por la capa de acceso de Figma. Se necesita una URL mas publica o permisos distintos.";
        stepLog.push({
          step,
          screen: currentScreen,
          action: "abandon",
          reason: "Llegue a una pantalla de acceso o registro y no pude entrar al prototipo real.",
          certainty: 26,
          timestamp: new Date().toISOString()
        });
        await safeCaptureScreenshot(page, runDir, screenshots, currentScreen, step + 1, runId);
        break;
      }
      if (guardrailStatus.kind === "timeout") {
        completionStatus = "abandoned";
        executionNotes = "El prototipo quedo en loading o restart demasiado tiempo. El run se cerro para no quedarse colgado.";
        stepLog.push({
          step,
          screen: currentScreen,
          action: "abandon",
          reason: "Espere la salida del estado de carga, pero el prototipo no llego a una pantalla usable.",
          certainty: 24,
          timestamp: new Date().toISOString()
        });
        await safeCaptureScreenshot(page, runDir, screenshots, currentScreen, step + 1, runId);
        break;
      }

      const activeFrame = (await getInteractionFrame(page, task)) || context.interactionFrame;
      if (activeFrame) {
        context.interactionFrame = activeFrame;
      }
      const candidates = await collectCandidates(page, activeFrame);
      const plan = chooseCandidate(candidates, task, persona, rng, step, activeFrame);
      if (!plan) {
        completionStatus = "abandoned";
        stepLog.push({
          step,
          screen: currentScreen,
          action: "abandon",
          reason: "No encontre un objetivo visible o navegable para seguir avanzando.",
          certainty: 34,
          timestamp: new Date().toISOString()
        });
        break;
      }

      if (plan.type === "coordinate") {
        await page.mouse.click(plan.x, plan.y);
      } else {
        await page.mouse.click(plan.centerX, plan.centerY);
      }

      await page.waitForTimeout(Math.min(1200, timing.interactiveWaitMs));
      const nextFingerprint = await safeFingerprintPage(page);
      const nextScreen = await safeGetScreenLabel(page, step + 1);
      const certainty = Math.max(40, Math.min(92, Math.round(plan.score || 64)));
      const point = {
        x: Math.round(plan.centerX || plan.x),
        y: Math.round(plan.centerY || plan.y),
        step,
        screen: currentScreen,
        certainty,
        weight: certainty / 100
      };
      clickPoints.push(point);
      stepLog.push({
        step,
        screen: currentScreen,
        action: plan.type === "candidate" ? "click_text" : "click_region",
        reason: plan.reason,
        certainty,
        timestamp: new Date().toISOString()
      });

      if (nextFingerprint !== previousFingerprint) {
        screenTransitions.push({ from: currentScreen, to: nextScreen, step });
        currentScreen = nextScreen;
        context.currentScreen = currentScreen;
        previousFingerprint = nextFingerprint;
      } else if (step >= 2) {
        completionStatus = "abandoned";
        executionNotes = "La pantalla no cambio despues de intentos repetidos.";
        await safeCaptureScreenshot(page, runDir, screenshots, currentScreen, step + 1, runId);
        break;
      }

      await safeCaptureScreenshot(page, runDir, screenshots, currentScreen, step + 1, runId);
      if (context.interactionFrame) {
        await writeFrameDebugArtifact(runDir, runId, currentScreen, context.interactionFrame, debugArtifacts, page.viewportSize());
      }

      if (step >= 2 && looksSuccessful(task, plan, nextScreen)) {
        completionStatus = "completed";
        break;
      }

      if (step === task.max_steps) {
        completionStatus = "uncertain";
      }
    }

    const findings = buildFindings(task, persona, completionStatus, rng);
    const endedAt = new Date();
    return {
      id: runId,
      project_id: task.project_id || persona.project_id || null,
      task_id: task.id,
      persona_id: persona.id,
      persona_version: `v${persona.version}`,
      seed,
      status: "done",
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      completion_status: completionStatus,
      persona_response: composePersonaResponse(persona, task, completionStatus, findings, stepLog.length || 1),
      step_log: stepLog,
      click_points: clickPoints,
      screen_transitions: screenTransitions,
      screenshots,
      debug_artifacts: debugArtifacts,
      observed_heatmaps: [{ screen: currentScreen, points: clickPoints }],
      observed_scanpaths: [{ screen: currentScreen, points: clickPoints }],
      predicted_attention_maps: task.predictive_attention_enabled
        ? [{ screen: currentScreen, points: buildPredictedPoints(rng), notes: buildPredictiveNotes(task, persona) }]
        : [],
      report_summary: summarizeRun(task, persona, completionStatus, findings),
      report_details: {
        primary_screen: screenshots[0] ? screenshots[0].screen : currentScreen,
        interaction_frame: context.interactionFrame,
        debug_artifacts: debugArtifacts,
        prioritized_findings: findings,
        trust_signals: [
          "Cambios visibles entre pantallas",
          "Areas clickeables detectables",
          "Progreso perceptible despues de la accion principal"
        ],
        rejection_signals: [
          "Hotspots invisibles",
          "Ausencia de cambio perceptible tras el click",
          "Etiquetas o targets poco explicitios"
        ]
      },
      follow_up_questions: buildFollowUps(task, completionStatus),
      engine: "playwright",
      execution_notes: usedBlindWake ? `${executionNotes}` : executionNotes,
      mcp_enabled: task.mcp_enabled,
      source: "server-playwright"
    };
  } catch (error) {
    const fallback = buildRecoveredErrorRun(task, persona, iteration, error, context, {
      engine: "playwright-error",
      source: "server",
      execution_notes: `No se pudo abrir o navegar la URL: ${error.message}`
    });
    fallback.id = runId;
    return fallback;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error("Browser close failed:", closeError);
      }
    }
  }
}

async function collectCandidates(page, interactionFrame = null) {
  return page.evaluate((frame) => {
    const selectors = ["a", "button", "[role='button']", "[tabindex='0']", "[data-testid]"];
    const nodes = Array.from(document.querySelectorAll(selectors.join(",")));
    return nodes
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const text = (node.innerText || node.getAttribute("aria-label") || node.getAttribute("title") || "").trim();
        if (rect.width < 24 || rect.height < 24 || rect.top < 0 || rect.left < 0) {
          return null;
        }
        if (rect.bottom > window.innerHeight + 32 || rect.right > window.innerWidth + 32) {
          return null;
        }
        if (rect.width > window.innerWidth * 0.96 || rect.height > 180) {
          return null;
        }
        if (text.length > 90) {
          return null;
        }
        const computed = window.getComputedStyle(node);
        if (computed.pointerEvents === "none" || computed.visibility === "hidden" || computed.display === "none") {
          return null;
        }
        if (frame) {
          const centerX = rect.x + rect.width / 2;
          const centerY = rect.y + rect.height / 2;
          if (
            centerX < frame.left ||
            centerX > frame.left + frame.width ||
            centerY < frame.top ||
            centerY > frame.top + frame.height
          ) {
            return null;
          }
        }
        return {
          text,
          isRestart: /restart/i.test(text),
          tag: node.tagName.toLowerCase(),
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          centerX: rect.x + rect.width / 2,
          centerY: rect.y + rect.height / 2
        };
      })
      .filter(Boolean)
      .slice(0, 24);
  }, interactionFrame);
}

function chooseCandidate(candidates, task, persona, rng, step, interactionFrame = null) {
  if (!candidates.length) {
    const fallback = resolveFrameFallbackPoint(interactionFrame, step);
    return {
      type: "coordinate",
      x: fallback.x,
      y: fallback.y,
      centerX: fallback.x,
      centerY: fallback.y,
      reason: interactionFrame
        ? "No encontre elementos semanticos visibles y probe una region probable dentro del frame mobile del prototipo."
        : "No encontre elementos semanticos visibles y probe una region probable del prototipo.",
      score: 44
    };
  }

  const tokens = tokenize(`${task.prompt} ${task.success_criteria}`);
  const scored = candidates
    .map((candidate) => {
      const textTokens = tokenize(candidate.text);
      const textOverlap = textTokens.filter((token) => tokens.includes(token)).length;
      const ctaBias = candidate.centerY > 500 ? 18 : 0;
      const clarityBias = persona.digital_level === "low" && candidate.text ? 12 : 0;
      const cookieBias = /(allow all cookies|do not allow cookies|cookie settings|accept|reject)/i.test(candidate.text) ? 32 : 0;
      const noisePenalty = /(cookies?|sign up|log in|login|register)/i.test(candidate.text) && !/(allow all cookies|do not allow cookies)/i.test(candidate.text) ? 18 : 0;
      const restartPenalty = candidate.isRestart ? 24 : 0;
      const shortLabelBias = candidate.text && candidate.text.length <= 28 ? 8 : 0;
      const score = 40 + textOverlap * 14 + ctaBias + clarityBias + cookieBias + shortLabelBias - noisePenalty - restartPenalty - step * 2;
      return { ...candidate, score };
    })
    .sort((a, b) => b.score - a.score);

  const chosen = scored[0];
  return {
    ...chosen,
    type: "candidate",
    reason: chosen.text
      ? `Hice click en "${chosen.text}" porque parecia la accion mas coherente con la tarea.`
      : "Probe la zona clickeable mas prominente disponible."
  };
}

async function prepareFigmaSurface(page) {
  const buttonTargets = [
    "Allow all cookies",
    "Do not allow cookies",
    "Allow cookies",
    "Accept all",
    "Aceptar",
    "Aceptar todo",
    "Continuar",
    "Continue",
    "Close",
    "Cerrar",
    "Got it"
  ];

  for (const label of buttonTargets) {
    const locator = page.getByRole("button", { name: new RegExp(escapeRegExp(label), "i") }).first();
    if (await locator.count()) {
      try {
        await locator.click({ timeout: 1200 });
        await page.waitForTimeout(500);
      } catch (error) {
      }
    }
  }

  try {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  } catch (error) {
  }
}

async function settleFigmaSurface(page, deadline, timing = resolveNavigationTiming(), task = {}) {
  const surfaceDeadline = Math.min(deadline, Date.now() + timing.surfaceTimeoutMs);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (Date.now() >= surfaceDeadline) {
      return { kind: "timeout" };
    }
    await prepareFigmaSurface(page);
    const status = await inspectBlockingSurface(page);
    if (status.kind === "loading") {
      if (attempt >= 2) {
        const restartLocator = page.getByRole("button", { name: /restart/i }).first();
        if (await restartLocator.count()) {
          try {
            await restartLocator.click({ timeout: 1200 });
            await page.waitForTimeout(timing.interactiveWaitMs);
          } catch (error) {
          }
        }
      }
      await page.waitForTimeout(timing.interactiveWaitMs);
      continue;
    }
    if (status.kind === "cookies") {
      await page.waitForTimeout(500);
      continue;
    }
    if (status.kind === "restart-ready") {
      const restartLocator = page.getByRole("button", { name: /restart/i }).first();
      if (await restartLocator.count()) {
        try {
          await restartLocator.click({ timeout: 1200 });
          await page.waitForTimeout(timing.interactiveWaitMs);
          continue;
        } catch (error) {
        }
      }
    }
    if (status.kind === "clear") {
      const interactionFrame = await getInteractionFrame(page, task);
      if (interactionFrame && interactionFrame.confidence >= 0.55) {
        return { kind: "clear", frame: interactionFrame };
      }
      const interactiveReady = await hasMeaningfulInteractiveTargets(page, interactionFrame);
      if (!interactiveReady && Date.now() + timing.interactiveWaitMs < surfaceDeadline) {
        await page.waitForTimeout(timing.interactiveWaitMs);
        continue;
      }
    }
    return status;
  }
  if (Date.now() >= surfaceDeadline) {
    return { kind: "timeout" };
  }
  return inspectBlockingSurface(page);
}

async function inspectBlockingSurface(page) {
  return page.evaluate(() => {
    const text = (document.body && document.body.innerText ? document.body.innerText : "").toLowerCase();
    const onlyShortText = text.replace(/\s+/g, " ").trim();
    const hasLoginWall =
      text.includes("want to check out this file") ||
      text.includes("sign up or log in") ||
      text.includes("log in to figma") ||
      text.includes("create an account");
    const hasCookieBanner =
      text.includes("allow all cookies") ||
      text.includes("do not allow cookies") ||
      text.includes("cookie settings");
    const hasRestartButton = text.includes("restart");
    const hasLoadingSurface =
      (!hasRestartButton && onlyShortText.length < 80 && document.querySelectorAll("svg").length > 0 && document.querySelectorAll("button").length <= 2) ||
      text.includes("loading");

    if (hasLoginWall) {
      return { kind: "login-wall" };
    }
    if (hasRestartButton) {
      return { kind: "restart-ready" };
    }
    if (hasLoadingSurface) {
      return { kind: "loading" };
    }
    if (hasCookieBanner) {
      return { kind: "cookies" };
    }
    return { kind: "clear" };
  });
}

async function hasMeaningfulInteractiveTargets(page, interactionFrame = null) {
  const candidates = await collectCandidates(page, interactionFrame);
  return candidates.some((candidate) => !candidate.isRestart && (candidate.text || candidate.width >= 44 || candidate.height >= 44));
}

async function buildBlockedRun(task, persona, startedAt, seed, runId, rng, reason, executionNotes, runDir, page) {
  const screen = await safeGetScreenLabel(page, 1);
  const screenshots = [];
  const debugArtifacts = [];
  await safeCaptureScreenshot(page, runDir, screenshots, screen, 1, runId);
  const interactionFrame = await getInteractionFrame(page, task);
  const viewport = safeViewportSize(page);
  if (interactionFrame && viewport) {
    await writeFrameDebugArtifact(runDir, runId, screen, interactionFrame, debugArtifacts, viewport);
  }
  const findings = buildFindings(task, persona, "abandoned", rng);
  return {
    id: runId,
    project_id: task.project_id || persona.project_id || null,
    task_id: task.id,
    persona_id: persona.id,
    persona_version: `v${persona.version}`,
    seed,
    status: "done",
    started_at: startedAt.toISOString(),
    ended_at: new Date().toISOString(),
    completion_status: "abandoned",
    persona_response: composePersonaResponse(persona, task, "abandoned", findings, 1),
    step_log: [
      {
        step: 1,
        screen,
        action: "abandon",
        reason,
        certainty: 26,
        timestamp: new Date().toISOString()
      }
    ],
    click_points: [],
    screen_transitions: [],
    screenshots,
    debug_artifacts: debugArtifacts,
    observed_heatmaps: [{ screen, points: [] }],
    observed_scanpaths: [{ screen, points: [] }],
    predicted_attention_maps: task.predictive_attention_enabled
      ? [{ screen, points: buildPredictedPoints(rng), notes: buildPredictiveNotes(task, persona) }]
      : [],
    report_summary: summarizeRun(task, persona, "abandoned", findings),
    report_details: {
      primary_screen: screen,
      interaction_frame: interactionFrame,
      debug_artifacts: debugArtifacts,
      prioritized_findings: findings,
      trust_signals: ["Cambios visibles entre pantallas", "Areas clickeables detectables", "Progreso perceptible despues de la accion principal"],
      rejection_signals: ["Hotspots invisibles", "Ausencia de cambio perceptible tras el click", "Etiquetas o targets poco explicitios"]
    },
    follow_up_questions: buildFollowUps(task, "abandoned"),
    engine: "playwright",
    execution_notes: executionNotes,
    mcp_enabled: task.mcp_enabled,
    source: "server-playwright"
  };
}

function resolveNavigationTiming(task = {}) {
  const overrides = task.navigation_overrides || {};
  return {
    runTimeoutMs: sanitizeTimeout(overrides.run_timeout_ms, DEFAULT_RUN_TIMEOUT_MS, 15000, 180000),
    surfaceTimeoutMs: sanitizeTimeout(overrides.surface_timeout_ms, DEFAULT_SURFACE_TIMEOUT_MS, 4000, 90000),
    interactiveWaitMs: sanitizeTimeout(overrides.interactive_wait_ms, DEFAULT_FIGMA_INTERACTIVE_WAIT_MS, 400, 10000),
    initialWaitMs: sanitizeTimeout(overrides.initial_wait_ms, DEFAULT_INITIAL_WAIT_MS, 400, 15000),
    pageActionTimeoutMs: sanitizeTimeout(overrides.page_action_timeout_ms, DEFAULT_PAGE_ACTION_TIMEOUT_MS, 1000, 20000),
    pageNavigationTimeoutMs: sanitizeTimeout(overrides.page_navigation_timeout_ms, DEFAULT_PAGE_NAVIGATION_TIMEOUT_MS, 4000, 30000),
    gotoTimeoutMs: sanitizeTimeout(overrides.goto_timeout_ms, DEFAULT_GOTO_TIMEOUT_MS, 6000, 60000),
    startupGraceMs: sanitizeTimeout(overrides.startup_grace_ms, DEFAULT_STARTUP_GRACE_MS, 0, 120000),
    blindWakeEnabled: Boolean(overrides.blind_wake_enabled),
    blindWakePoints: normalizeBlindWakePoints(overrides.blind_wake_points)
  };
}

function sanitizeTimeout(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function normalizeBlindWakePoints(rawPoints) {
  if (!Array.isArray(rawPoints) || !rawPoints.length) {
    return DEFAULT_BLIND_WAKE_POINTS;
  }
  const parsed = rawPoints
    .map((point, index) => ({
      x: Math.max(0.08, Math.min(0.92, Number(point?.x))),
      y: Math.max(0.08, Math.min(0.92, Number(point?.y))),
      label: point?.label || `blind-${index + 1}`
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  return parsed.length ? parsed : DEFAULT_BLIND_WAKE_POINTS;
}

async function extendFigmaStartupWindow(page, task, deadline, timing) {
  if (!task.url || !/figma\.com\/proto/i.test(task.url) || !timing.startupGraceMs) {
    return { kind: "skipped" };
  }

  const startupDeadline = Math.min(deadline, Date.now() + timing.startupGraceMs);
  while (Date.now() < startupDeadline) {
    const blocking = await inspectBlockingSurface(page);
    if (blocking.kind === "login-wall") {
      return blocking;
    }
    if (blocking.kind === "loading" || blocking.kind === "restart-ready" || blocking.kind === "cookies") {
      await prepareFigmaSurface(page);
      await page.waitForTimeout(timing.interactiveWaitMs);
      continue;
    }

    const currentLabel = await safeGetScreenLabel(page, 1);
    const interactionFrame = await getInteractionFrame(page, task);
    const targetsReady = await hasMeaningfulInteractiveTargets(page, interactionFrame);
    if ((interactionFrame && interactionFrame.confidence >= 0.55) || (targetsReady && !looksLikeStaticPrototypeShell(currentLabel, task))) {
      return { kind: "ready" };
    }
    if (targetsReady) {
      return { kind: "ready" };
    }

    await prepareFigmaSurface(page);
    await page.waitForTimeout(timing.interactiveWaitMs);
  }

  return { kind: "timeout" };
}

async function attemptBlindWakeSequence(page, task, deadline, timing) {
  if (!timing.blindWakeEnabled || !task.url || !/figma\.com\/proto/i.test(task.url)) {
    return { kind: "skipped" };
  }

  const interactionFrame = (await getInteractionFrame(page, task)) || inferCenteredMobileFrame(page.viewportSize());
  let previousFingerprint = await safeFingerprintPage(page);
  for (const point of timing.blindWakePoints) {
    if (Date.now() >= deadline) {
      return { kind: "timeout" };
    }
    const absolutePoint = resolveRelativeFramePoint(interactionFrame, point);
    try {
      await page.mouse.click(absolutePoint.x, absolutePoint.y);
      await page.waitForTimeout(timing.interactiveWaitMs);
    } catch (error) {
    }

    const blocking = await inspectBlockingSurface(page);
    if (blocking.kind === "login-wall") {
      return blocking;
    }

    const nextFingerprint = await safeFingerprintPage(page);
    const refreshedFrame = (await getInteractionFrame(page, task)) || interactionFrame;
    const targetsReady = await hasMeaningfulInteractiveTargets(page, refreshedFrame);
    if (nextFingerprint !== previousFingerprint || targetsReady) {
      return { kind: "ready", point: absolutePoint, frame: refreshedFrame };
    }
    previousFingerprint = nextFingerprint;
  }

  return { kind: "timeout" };
}

async function getInteractionFrame(page, task = {}) {
  const viewport = safeViewportSize(page);
  if (!page || isPageUnavailable(page)) {
    return inferCenteredMobileFrame(viewport);
  }
  if (!task.url || !/figma\.com\/proto/i.test(task.url)) {
    return null;
  }

  const visualFrame = await detectVisualMobileFrame(page);
  if (visualFrame && visualFrame.confidence >= 0.5) {
    return visualFrame;
  }

  let detected = null;
  try {
    detected = await page.evaluate(() => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const centerX = viewportWidth / 2;
      const minWidth = Math.max(220, Math.min(280, viewportWidth * 0.18));
      const maxWidth = Math.min(540, viewportWidth * 0.42);
      const minHeight = Math.max(420, viewportHeight * 0.45);
      const maxHeight = Math.min(viewportHeight - 40, viewportHeight * 0.92);
      const nodes = Array.from(document.querySelectorAll("iframe, canvas, img, svg, div"));
      const candidates = nodes
        .map((node) => {
          const rect = node.getBoundingClientRect();
          if (rect.width < minWidth || rect.width > maxWidth) return null;
          if (rect.height < minHeight || rect.height > maxHeight) return null;
          if (rect.top < 0 || rect.bottom > viewportHeight + 8) return null;
          const styles = window.getComputedStyle(node);
          if (styles.display === "none" || styles.visibility === "hidden" || styles.opacity === "0") return null;
          const nodeCenterX = rect.left + rect.width / 2;
          const centerDistance = Math.abs(nodeCenterX - centerX);
          if (centerDistance > viewportWidth * 0.16) return null;
          const aspect = rect.height / Math.max(rect.width, 1);
          if (aspect < 1.45 || aspect > 2.8) return null;
          const areaScore = Math.min(1, (rect.width * rect.height) / (viewportWidth * viewportHeight * 0.16));
          const centerScore = 1 - centerDistance / Math.max(viewportWidth * 0.16, 1);
          const aspectScore = 1 - Math.min(Math.abs(aspect - 2.0), 1);
          const score = areaScore * 0.45 + centerScore * 0.35 + aspectScore * 0.2;
          return {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            confidence: Math.max(0.2, Math.min(0.98, score))
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.confidence - a.confidence);
      return candidates[0] || null;
    });
  } catch (error) {
    detected = null;
  }

  return detected || visualFrame || inferCenteredMobileFrame(viewport);
}

function inferCenteredMobileFrame(viewport) {
  if (!viewport) {
    return null;
  }
  const width = Math.round(Math.min(360, viewport.width * 0.28));
  const height = Math.round(Math.min(viewport.height - 80, width * 2.05));
  return {
    left: Math.round((viewport.width - width) / 2),
    top: Math.round(Math.max(24, (viewport.height - height) / 2)),
    width,
    height,
    confidence: 0.32
  };
}

function resolveRelativeFramePoint(frame, point) {
  const baseFrame = frame || { left: 0, top: 0, width: 390, height: 844 };
  return {
    x: Math.round(baseFrame.left + baseFrame.width * point.x),
    y: Math.round(baseFrame.top + baseFrame.height * point.y),
    label: point.label
  };
}

function resolveFrameFallbackPoint(frame, step) {
  const pattern = step % 3 === 1 ? { x: 0.5, y: 0.78 } : step % 3 === 2 ? { x: 0.5, y: 0.45 } : { x: 0.5, y: 0.24 };
  return resolveRelativeFramePoint(frame || { left: 0, top: 0, width: 390, height: 844 }, pattern);
}

function safeViewportSize(page) {
  try {
    return page && typeof page.viewportSize === "function" ? page.viewportSize() : null;
  } catch (error) {
    return null;
  }
}

async function detectVisualMobileFrame(page) {
  try {
    const screenshot = await withTimeout(
      page.screenshot({ type: "png", fullPage: false }),
      VISUAL_FRAME_DETECTION_TIMEOUT_MS,
      "visual-frame-screenshot-timeout"
    );
    const script = `
import io, json, sys
from PIL import Image

raw = sys.stdin.buffer.read()
im = Image.open(io.BytesIO(raw)).convert("RGB")
w, h = im.size
if w <= 0 or h <= 0:
    print("null")
    raise SystemExit(0)

left_bound = int(w * 0.18)
right_bound = int(w * 0.82)
top_bound = int(h * 0.08)
bottom_bound = int(h * 0.94)

mask_points = []
for y in range(top_bound, bottom_bound, 3):
    row_hits = []
    for x in range(left_bound, right_bound, 3):
        r, g, b = im.getpixel((x, y))
        brightness = (r + g + b) / 3
        if brightness > 105:
            row_hits.append(x)
    if len(row_hits) >= max(8, int((right_bound - left_bound) * 0.04 / 3)):
        mask_points.append((min(row_hits), max(row_hits), y))

if not mask_points:
    print("null")
    raise SystemExit(0)

xs_min = min(item[0] for item in mask_points)
xs_max = max(item[1] for item in mask_points)
ys_min = min(item[2] for item in mask_points)
ys_max = max(item[2] for item in mask_points)

width = xs_max - xs_min
height = ys_max - ys_min
if width < w * 0.08 or height < h * 0.22:
    print("null")
    raise SystemExit(0)

center_x = xs_min + width / 2
center_distance = abs(center_x - (w / 2))
confidence = 0.35
if width >= w * 0.12:
    confidence += 0.15
if height >= h * 0.35:
    confidence += 0.15
if center_distance <= w * 0.08:
    confidence += 0.2
aspect = height / max(width, 1)
if 1.45 <= aspect <= 2.6:
    confidence += 0.1

result = {
    "left": int(xs_min),
    "top": int(ys_min),
    "width": int(width),
    "height": int(height),
    "confidence": round(min(confidence, 0.95), 3)
}
print(json.dumps(result))
`;
    const { stdout } = await withTimeout(
      execFile("python3", ["-c", script], {
        input: screenshot,
        maxBuffer: 1024 * 1024 * 10,
        timeout: VISUAL_FRAME_DETECTION_TIMEOUT_MS
      }),
      VISUAL_FRAME_DETECTION_TIMEOUT_MS + 200,
      "visual-frame-python-timeout"
    );
    const raw = String(stdout || "").trim();
    if (!raw || raw === "null") {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !Number.isFinite(parsed.left) || !Number.isFinite(parsed.top)) {
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
}

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(label));
    }, timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function writeFrameDebugArtifact(runDir, runId, screen, frame, debugArtifacts, viewport) {
  if (!frame || !viewport) {
    return;
  }
  const filename = `frame-debug-${String(debugArtifacts.length + 1).padStart(2, "0")}.svg`;
  const absolutePath = path.join(runDir, filename);
  const svg = buildFrameDebugSvg(frame, viewport, screen);
  await fs.writeFile(absolutePath, svg, "utf8");
  debugArtifacts.push({
    type: "interaction-frame",
    screen,
    src: `/artifacts/${runId}/${filename}`,
    confidence: frame.confidence
  });
}

function buildFrameDebugSvg(frame, viewport, screen) {
  const width = viewport.width || 390;
  const height = viewport.height || 844;
  const confidence = Number.isFinite(frame.confidence) ? frame.confidence.toFixed(2) : "n/a";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `<rect width="${width}" height="${height}" fill="#050505"/>`,
    `<rect x="${frame.left}" y="${frame.top}" width="${frame.width}" height="${frame.height}" rx="18" fill="rgba(255,255,255,0.10)" stroke="#35d07f" stroke-width="3"/>`,
    `<rect x="${frame.left}" y="${frame.top}" width="${frame.width}" height="28" fill="rgba(53,208,127,0.16)"/>`,
    `<text x="20" y="28" fill="#f4f4f4" font-family="Menlo, monospace" font-size="14">interaction frame debug</text>`,
    `<text x="20" y="48" fill="#c9c9c9" font-family="Menlo, monospace" font-size="12">screen: ${escapeXml(screen || "unknown")}</text>`,
    `<text x="20" y="66" fill="#c9c9c9" font-family="Menlo, monospace" font-size="12">confidence: ${confidence}</text>`,
    `<text x="20" y="84" fill="#c9c9c9" font-family="Menlo, monospace" font-size="12">box: x=${Math.round(frame.left)} y=${Math.round(frame.top)} w=${Math.round(frame.width)} h=${Math.round(frame.height)}</text>`,
    `</svg>`
  ].join("");
}

function buildFrameDebugDataUrl(frame, viewport, screen) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildFrameDebugSvg(frame, viewport, screen))}`;
}


function looksLikeStaticPrototypeShell(screenLabel, task) {
  const label = String(screenLabel || "").trim().toLowerCase();
  const urlBag = String(task.url || "").toLowerCase();
  if (!label) {
    return true;
  }
  return (
    label.includes("screen 1") ||
    label.includes("figma") ||
    urlBag.includes(encodeURIComponent(label)) ||
    urlBag.includes(label.replace(/\s+/g, "-"))
  );
}

function looksSuccessful(task, plan, screen) {
  const bag = `${plan.text || ""} ${screen || ""} ${task.success_criteria || ""}`.toLowerCase();
  return ["book", "confirm", "checkout", "reserva", "confirmacion", "success"].some((token) => bag.includes(token));
}

async function fingerprintPage(page) {
  return page.evaluate(() => {
    const title = document.title || "";
    const text = (document.body && document.body.innerText ? document.body.innerText : "").slice(0, 180);
    return `${location.href}|${title}|${text}`;
  });
}

async function getScreenLabel(page, step) {
  return page.evaluate((index) => {
    const title = document.title || "";
    const heading = document.querySelector("h1, h2, [role='heading']");
    const headingText = heading ? heading.textContent.trim() : "";
    return headingText || title || `Screen ${index}`;
  }, step);
}

async function captureScreenshot(page, runDir, screenshots, screen, step, runId) {
  const filename = `step-${String(step).padStart(2, "0")}.png`;
  const absolutePath = path.join(runDir, filename);
  await page.screenshot({ path: absolutePath, fullPage: false });
  screenshots.push({
    screen,
    step,
    src: `/artifacts/${runId}/${filename}`
  });
}

async function getPlaywright() {
  if (playwrightModulePromise === undefined) {
    playwrightModulePromise = import("playwright").catch(() => null);
  }
  return playwrightModulePromise;
}

async function ensurePaths() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
}

async function ensureState() {
  try {
    await fs.access(STATE_FILE);
  } catch (error) {
    await writeState(buildInitialState());
  }
}

async function readState() {
  const raw = await fs.readFile(STATE_FILE, "utf8");
  const parsed = JSON.parse(raw);
  const migrated = migrateState(parsed);
  if (migrated.changed) {
    await writeState(migrated.state);
  }
  return migrated.state;
}

async function writeState(state) {
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function serveFile(res, filePath) {
  const contents = await fs.readFile(filePath);
  const ext = path.extname(filePath);
  const type =
    ext === ".html"
      ? "text/html; charset=utf-8"
      : ext === ".css"
        ? "text/css; charset=utf-8"
        : ext === ".js"
          ? "application/javascript; charset=utf-8"
          : ext === ".png"
            ? "image/png"
            : "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  res.end(contents);
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function buildInitialState() {
  const now = new Date().toISOString();
  const project = {
    id: uid("project"),
    name: "Demo workspace",
    description: "Proyecto demo para explorar arquetipos, tareas y corridas del laboratorio.",
    created_at: now,
    updated_at: now
  };
  const personaA = {
    id: uid("persona"),
    project_id: project.id,
    name: "Catalina, viajera practica",
    description: "Busca resolver rapido y no tolera pasos ambiguos cuando esta en movimiento.",
    role: "Profesional comercial",
    segment: "Planificadora de escapadas cortas",
    functional_context: "Organiza viajes personales entre reuniones y trayectos.",
    usage_context: "Movil, ratos cortos, multitarea.",
    goals: "Encontrar una opcion confiable y cerrar rapido.",
    motivations: "Ahorrar tiempo y evitar errores en reserva.",
    needs: "Claridad en costos, confianza y continuidad entre pantallas.",
    behaviors: "Compara un poco, luego decide por conveniencia.",
    pains: "Formularios largos, mensajes ambiguos y sorpresas al final.",
    frictions: "Carga cognitiva alta y dudas en el siguiente paso.",
    personality_traits: "Directa, apurada, cautelosa con pagos.",
    digital_environment: "Usa apps de viajes y productividad todo el dia.",
    digital_behavior: "Mobile-first, explora poco y abandona rapido si algo no cierra.",
    devices: "iPhone y notebook de trabajo",
    digital_level: "medium",
    apps_used: "Booking, Airbnb, Google Maps, Notion",
    restrictions: "Poco tiempo, mala conectividad ocasional.",
    attachments: "",
    status: "active",
    version: 1,
    created_at: now,
    updated_at: now
  };

  const personaB = {
    id: uid("persona"),
    project_id: project.id,
    name: "Matias, comprador tecnico",
    description: "Detecta ineficiencias rapido y espera control sobre lo que hace.",
    role: "Ingeniero de software",
    segment: "Adoptador digital exigente",
    functional_context: "Evalua herramientas nuevas para uso personal y laboral.",
    usage_context: "Desktop-first, sesiones mas largas.",
    goals: "Completar tareas con velocidad y transparencia.",
    motivations: "Reducir pasos innecesarios y entender el sistema.",
    needs: "Senales claras de estado, consistencia y baja friccion.",
    behaviors: "Explora por su cuenta, compara y cuestiona decisiones de interfaz.",
    pains: "Flows ineficientes, labels vagos, info oculta.",
    frictions: "Errores evitables y falta de feedback.",
    personality_traits: "Analitico, rapido, poco tolerante a fallas repetidas.",
    digital_environment: "Usa productos digitales de forma intensiva.",
    digital_behavior: "Desktop-first, baja tolerancia a fricciones evitables.",
    devices: "MacBook Pro y Android",
    digital_level: "high",
    apps_used: "Figma, Linear, Slack, Chrome, Gmail",
    restrictions: "No acepta pasos sin razon clara.",
    attachments: "",
    status: "active",
    version: 1,
    created_at: now,
    updated_at: now
  };

  const taskA = {
    id: uid("task"),
    project_id: project.id,
    persona_id: personaA.id,
    type: "navigation",
    prompt: "Estas buscando tu proximo lugar de vacaciones y quieres hacer un booking en el sitio.",
    url: "https://www.figma.com/proto/demo-vacation-flow",
    success_criteria: "Encontrar una propiedad y llegar al paso de booking con confianza.",
    max_steps: 6,
    mcp_enabled: true,
    predictive_attention_enabled: true,
    artifacts_enabled: true,
    status: "ready",
    created_at: now,
    updated_at: now
  };

  const taskB = {
    id: uid("task"),
    project_id: project.id,
    persona_id: personaB.id,
    type: "idea",
    prompt: "Validar una nueva feature que resume automaticamente comparativas de planes.",
    url: "",
    success_criteria: "Entender que tan util, creible y adoptable suena para el arquetipo.",
    max_steps: 4,
    mcp_enabled: false,
    predictive_attention_enabled: false,
    artifacts_enabled: true,
    status: "ready",
    created_at: now,
    updated_at: now
  };

  const runs = [];
  return {
    projects: [project],
    personas: [personaA, personaB],
    tasks: [taskA, taskB],
    runs,
    calibrations: []
  };
}

function migrateState(state) {
  const next = {
    projects: Array.isArray(state.projects) ? [...state.projects] : [],
    personas: Array.isArray(state.personas) ? [...state.personas] : [],
    tasks: Array.isArray(state.tasks) ? [...state.tasks] : [],
    runs: Array.isArray(state.runs) ? [...state.runs] : [],
    calibrations: Array.isArray(state.calibrations) ? [...state.calibrations] : []
  };
  let changed = !Array.isArray(state.projects);
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

  next.personas = next.personas.map((item) => {
    if (item.project_id) return item;
    changed = true;
    return { ...item, project_id: fallbackProjectId };
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

  next.projects = next.projects.map((item) => ({
    ...item,
    updated_at: item.updated_at || item.created_at || now,
    created_at: item.created_at || now
  }));

  return { state: next, changed };
}

function simulateRun(task, persona, iteration, overrides = {}) {
  const startedAt = new Date();
  const seed = hashString(`${task.id}:${persona.id}:${iteration}:${startedAt.toISOString()}`).toString().slice(0, 6);
  const rng = mulberry32(Number(seed));
  const stepCount = Math.max(2, Math.min(task.max_steps || 5, Math.floor(rng() * 4) + 3));
  const screens = task.type === "navigation" ? buildNavigationScreens(task, rng) : ["Idea brief", "Reaction", "Follow-up"];
  const clickPoints = [];
  const stepLog = [];
  const transitions = [];
  const certaintyBase = persona.digital_level === "high" ? 84 : persona.digital_level === "medium" ? 68 : 52;
  let completionStatus = overrides.completion_status || "completed";

  for (let step = 1; step <= stepCount; step += 1) {
    const screen = screens[Math.min(step - 1, screens.length - 1)];
    const nextScreen = screens[Math.min(step, screens.length - 1)];
    const certainty = Math.max(28, Math.min(94, Math.round(certaintyBase - rng() * 18 + step * 2)));
    const x = 56 + Math.round(rng() * 248);
    const y = 130 + Math.round(rng() * 408);
    const action = task.type === "idea" ? "reflect" : "click_region";
    clickPoints.push({ x, y, step, screen, certainty, weight: certainty / 100 });
    stepLog.push({
      step,
      screen,
      action,
      reason: composeStepReason(persona, task, action, screen, certainty),
      certainty,
      timestamp: new Date(startedAt.getTime() + step * 9000).toISOString()
    });
    if (screen !== nextScreen) {
      transitions.push({ from: screen, to: nextScreen, step });
    }
  }

  if (!overrides.completion_status && rng() > 0.68) {
    completionStatus = "uncertain";
  }

  const findings = buildFindings(task, persona, completionStatus, rng);
  const endedAt = new Date(startedAt.getTime() + stepCount * 9000);
  const screenshots = screens.map((screen, index) => ({
    screen,
    step: index + 1,
    src: buildScreenSvg(screen, task, persona, index)
  }));

  return {
    id: uid("run"),
    project_id: task.project_id || persona.project_id || null,
    task_id: task.id,
    persona_id: persona.id,
    persona_version: `v${persona.version}`,
    seed,
    status: "done",
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    completion_status: completionStatus,
    persona_response: composePersonaResponse(persona, task, completionStatus, findings, stepCount),
    step_log: stepLog,
    click_points: clickPoints,
    screen_transitions: transitions,
    screenshots,
    observed_heatmaps: [{ screen: screens[0], points: clickPoints }],
    observed_scanpaths: [{ screen: screens[0], points: clickPoints }],
    predicted_attention_maps: task.predictive_attention_enabled
      ? [{ screen: screens[0], points: buildPredictedPoints(rng), notes: buildPredictiveNotes(task, persona) }]
      : [],
    report_summary: summarizeRun(task, persona, completionStatus, findings),
    report_details: {
      primary_screen: screens[0],
      prioritized_findings: findings,
      trust_signals: ["Mensajes explicitos de avance", "Call to action visible", "Progreso legible"],
      rejection_signals: ["Etiquetas ambiguas", "Demasiadas decisiones juntas", "Baja claridad del siguiente paso"]
    },
    follow_up_questions: buildFollowUps(task, completionStatus),
    engine: overrides.engine || "server-simulated",
    execution_notes: overrides.execution_notes || "Simulacion ejecutada en el backend local.",
    mcp_enabled: task.mcp_enabled,
    source: overrides.source || "server"
  };
}

function buildErrorRun(task, persona, iteration, error, overrides = {}) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const fallback = simulateRun(task, persona, iteration, {
    engine: overrides.engine || "server-error",
    source: overrides.source || "server",
    completion_status: "error",
    execution_notes: overrides.execution_notes || `El run termino con error controlado: ${errorMessage}`
  });
  fallback.report_summary = `${persona.name} no pudo completar el task ${task.type} porque el runner encontro un error controlado.`;
  fallback.step_log = [
    {
      step: 1,
      screen: fallback.report_details.primary_screen || "Run bootstrap",
      action: "error",
      reason: `El runner se detuvo por un error controlado: ${errorMessage}`,
      certainty: 10,
      timestamp: new Date().toISOString()
    }
  ];
  fallback.click_points = [];
  fallback.screen_transitions = [];
  fallback.observed_heatmaps = [{ screen: fallback.report_details.primary_screen || "Run bootstrap", points: [] }];
  fallback.observed_scanpaths = [{ screen: fallback.report_details.primary_screen || "Run bootstrap", points: [] }];
  fallback.debug_artifacts = [];
  fallback.report_details.interaction_frame = null;
  fallback.report_details.debug_artifacts = [];
  fallback.report_details.prioritized_findings = [
    {
      label: "Error del runner",
      severity: "critical",
      detail: `La corrida no pudo completarse por un error controlado del sistema: ${errorMessage}`
    }
  ];
  return fallback;
}

function buildRecoveredErrorRun(task, persona, iteration, error, context, overrides = {}) {
  const fallback = buildErrorRun(task, persona, iteration, error, overrides);
  fallback.click_points = context.clickPoints || [];
  fallback.screen_transitions = context.screenTransitions || [];
  fallback.observed_heatmaps = [{ screen: context.currentScreen || fallback.report_details.primary_screen || "Run bootstrap", points: fallback.click_points }];
  fallback.observed_scanpaths = [{ screen: context.currentScreen || fallback.report_details.primary_screen || "Run bootstrap", points: fallback.click_points }];
  if (context.screenshots && context.screenshots.length) {
    fallback.screenshots = context.screenshots;
  }
  if (context.currentScreen) {
    fallback.report_details.primary_screen = context.currentScreen;
  }
  if (context.interactionFrame) {
    fallback.report_details.interaction_frame = context.interactionFrame;
  }
  if (context.debugArtifacts && context.debugArtifacts.length) {
    fallback.debug_artifacts = context.debugArtifacts;
    fallback.report_details.debug_artifacts = context.debugArtifacts;
  } else if (context.interactionFrame) {
    const inlineArtifact = {
      type: "interaction-frame",
      screen: context.currentScreen || fallback.report_details.primary_screen || "Run bootstrap",
      src: buildFrameDebugDataUrl(
        context.interactionFrame,
        context.viewport || { width: 390, height: 844 },
        context.currentScreen || fallback.report_details.primary_screen || "Run bootstrap"
      ),
      confidence: context.interactionFrame.confidence
    };
    fallback.debug_artifacts = [inlineArtifact];
    fallback.report_details.debug_artifacts = [inlineArtifact];
  }
  if (context.stepLog && context.stepLog.length) {
    fallback.step_log = [
      ...context.stepLog,
      {
        step: context.stepLog.length + 1,
        screen: context.currentScreen || fallback.report_details.primary_screen || "Run bootstrap",
        action: "error",
        reason: `El runner se detuvo por un error controlado: ${error instanceof Error ? error.message : String(error)}`,
        certainty: 10,
        timestamp: new Date().toISOString()
      }
    ];
  }
  return fallback;
}

async function safeCaptureScreenshot(page, runDir, screenshots, screen, step, runId) {
  if (!page || isPageUnavailable(page)) {
    screenshots.push({
      screen,
      step,
      src: buildScreenSvg(screen, { type: "navigation", url: "" }, { name: "Fallback" }, step - 1)
    });
    return;
  }
  try {
    await captureScreenshot(page, runDir, screenshots, screen, step, runId);
  } catch (error) {
    screenshots.push({
      screen,
      step,
      src: buildScreenSvg(screen, { type: "navigation", url: "" }, { name: "Fallback" }, step - 1)
    });
  }
}

async function safeFingerprintPage(page) {
  if (!page || isPageUnavailable(page)) {
    return `closed:${Date.now()}`;
  }
  try {
    return await fingerprintPage(page);
  } catch (error) {
    return `closed:${Date.now()}`;
  }
}

async function safeGetScreenLabel(page, step) {
  if (!page || isPageUnavailable(page)) {
    return `Screen ${step}`;
  }
  try {
    return await getScreenLabel(page, step);
  } catch (error) {
    return `Screen ${step}`;
  }
}

function isPageUnavailable(page) {
  try {
    return page.isClosed();
  } catch (error) {
    return true;
  }
}

function buildNavigationScreens(task, rng) {
  const hasBooking = /booking|reserva|vacacion|hotel/i.test(task.prompt);
  const hasCheckout = /checkout|pago|comprar|book/i.test(task.success_criteria);
  const host = getHostLabel(task.url || "figma.com");
  const screens = [`${host} cover`, "Browse options", hasBooking ? "Property details" : "Task details", "Decision point"];
  if (hasCheckout || rng() > 0.6) {
    screens.push("Checkout");
  }
  screens.push("Confirmation");
  return screens;
}

function composeStepReason(persona, task, action, screen, certainty) {
  const behavior = persona.digital_level === "high" ? "necesito control y senales claras" : persona.digital_level === "low" ? "necesito pasos mas guiados y familiares" : "necesito claridad suficiente para seguir sin friccion";
  return `En ${screen}, tome la accion ${action} porque ${behavior} y percibi una certeza de ${certainty}% frente al objetivo: ${task.prompt.toLowerCase()}.`;
}

function composePersonaResponse(persona, task, status, findings, stepCount) {
  const intro = `Yo llegue a esta prueba como ${persona.role || "usuario"} ${persona.segment ? `del segmento ${persona.segment}` : ""} y trate de ${task.prompt.toLowerCase()}.`;
  const understanding = task.type === "navigation"
    ? `Lo primero que entendi fue que tenia que recorrer un flujo con ${stepCount} pasos aproximados y fijarme rapido si podia avanzar sin sentirme perdido.`
    : "Lo primero que hice fue reaccionar desde mi contexto real y no desde una mirada experta del producto.";
  const friction = findings[0]
    ? `Lo que mas me freno fue ${findings[0].label.toLowerCase()}: ${findings[0].detail.toLowerCase()}.`
    : "No tengo suficiente informacion en mi perfil para responder eso con precision.";
  const confidence = status === "completed"
    ? "Segui porque el flujo me dio senales suficientes de control y continuidad."
    : "No llegue a sentir suficiente certeza para seguir con confianza.";
  const next = status === "abandoned" || status === "error"
    ? "Si esto me pasara en un uso real, probablemente lo dejaria para mas tarde o buscaria otra alternativa."
    : "Despues de esto seguiria evaluando si el flujo realmente vale el esfuerzo que me pide.";
  return `${intro} ${understanding} ${friction} ${confidence} ${next}`;
}

function summarizeRun(task, persona, status, findings) {
  const severity = findings[0] ? findings[0].severity : "medium";
  return `${persona.name} termino el task ${task.type} como ${status} con una friccion ${severity} centrada en ${findings[0] ? findings[0].label.toLowerCase() : "claridad general"}.`;
}

function buildFindings(task, persona, status, rng) {
  const level = persona.digital_level;
  return [
    {
      label: "Claridad del siguiente paso",
      severity: status === "abandoned" || status === "error" ? "critical" : "high",
      detail: level === "low"
        ? "El usuario necesita pasos mucho mas secuenciales para no perder confianza."
        : "El flujo muestra ambiguedad cuando intenta seguir a la siguiente pantalla."
    },
    {
      label: "Confianza en la accion principal",
      severity: status === "completed" ? "medium" : "high",
      detail: task.type === "navigation"
        ? "La llamada principal existe, pero no siempre parece suficientemente explicita."
        : "La propuesta genera interes, aunque todavia hay dudas sobre el riesgo y la conveniencia."
    },
    {
      label: "Carga cognitiva",
      severity: rng() > 0.58 ? "medium" : "low",
      detail: "Hay demasiadas decisiones simultaneas para un contexto de uso rapido o cansado."
    }
  ];
}

function buildFollowUps(task, status) {
  if (task.type === "idea") {
    return [
      "Quieres que te cuente que parte me resulto mas valiosa?",
      "Te interesa mas entender que me genera confianza o que me haria dudar?"
    ];
  }
  return status === "abandoned" || status === "error"
    ? [
        "Quieres que te explique el punto exacto donde dejaria el flujo?",
        "Te interesa que detalle por que no senti suficiente certeza para seguir?"
      ]
    : [
        "Quieres que te cuente que parte del flujo me parecio mas clara?",
        "Te interesa revisar donde senti mas esfuerzo aunque pude completar la tarea?"
      ];
}

function buildPredictedPoints(rng) {
  return Array.from({ length: 8 }, (_, index) => ({
    x: 70 + Math.round(rng() * 220),
    y: 110 + Math.round(rng() * 360),
    step: index + 1,
    screen: "Predictive",
    certainty: 60 + Math.round(rng() * 30),
    weight: 0.2 + rng() * 0.6
  }));
}

function buildPredictiveNotes(task, persona) {
  return [
    `Prediccion de atencion inicial ajustada al contexto de ${persona.segment || "uso"} y al task ${task.type}.`,
    "Las zonas de mayor saliencia se muestran como una capa estimada y no como comportamiento observado.",
    "Util para comparar expectativas visuales con los clicks reales del run."
  ];
}

function buildScreenSvg(screen, task, persona, index) {
  const accent = ["#ff6f3c", "#0f8b8d", "#6f8f3f", "#d1481f"][index % 4];
  const subtitle = task.type === "navigation" ? getHostLabel(task.url || "figma.com") : persona.name;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="360" height="640">
      <rect width="360" height="640" rx="28" fill="#fdf8f1" />
      <rect x="24" y="26" width="312" height="64" rx="18" fill="${accent}" opacity="0.16" />
      <rect x="24" y="112" width="312" height="120" rx="22" fill="#ffffff" stroke="rgba(0,0,0,0.08)" />
      <rect x="24" y="254" width="150" height="144" rx="20" fill="#ffffff" stroke="rgba(0,0,0,0.08)" />
      <rect x="186" y="254" width="150" height="144" rx="20" fill="#ffffff" stroke="rgba(0,0,0,0.08)" />
      <text x="32" y="58" fill="#191919" font-family="Avenir Next, sans-serif" font-size="16" font-weight="700">${escapeXml(screen)}</text>
      <text x="32" y="78" fill="#5d5548" font-family="Avenir Next, sans-serif" font-size="12">${escapeXml(subtitle)}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function tokenize(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñü\s]/gi, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function getHostLabel(url) {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch (error) {
    return "figma prototype";
  }
}

function uid(prefix) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function hashString(input) {
  let hash = 1779033703;
  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(hash ^ input.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return Math.abs(hash);
}

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function escapeXml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
