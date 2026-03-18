import path from "node:path";
import { promises as fs } from "node:fs";
import { ARTIFACTS_DIR } from "./config.mjs";
import { uid } from "./utils.mjs";
import { hashString, mulberry32 } from "../shared/utils.js";
import {
  composePersonaResponse,
  summarizeRun,
  buildFindings,
  buildFollowUps,
  buildPredictedPoints,
  buildPredictiveNotes
} from "../shared/reporting.js";
import { safeFingerprintPage, safeCaptureScreenshot, safeGetScreenLabel } from "./page-inspect.mjs";
import { writeFrameDebugArtifact } from "./frame-detection.mjs";
import { collectCandidates, chooseCandidate } from "./candidates.mjs";
import {
  settleFigmaSurface,
  buildBlockedRun,
  resolveNavigationTiming
} from "./figma-surface.mjs";
import {
  extendFigmaStartupWindow,
  attemptBlindWakeSequence,
  getInteractionFrame,
  looksSuccessful,
  safeViewportSize
} from "./figma-advanced.mjs";
import { buildRecoveredErrorRun } from "./error-runs.mjs";
import { simulateRun } from "../shared/simulation.js";
import { isVisionAvailable, analyzeScreenWithVision, mapVisionCoordsToPage } from "./vision.mjs";

export async function executeNavigationRun(task, persona, iteration, playwright) {
  if (!playwright) {
    return simulateRun(task, persona, iteration, {
      uid,
      overrides: {
        engine: "server-simulated",
        source: "server",
        execution_notes: "Playwright no esta instalado. Se uso fallback simulado."
      },
      useChooseAction: false,
      completionStrategy: "server",
      engineLabel: "server-simulated",
      sourceLabel: "server",
      executionNotes: "Playwright no esta instalado. Se uso fallback simulado."
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
    browser = await playwright.chromium.launch({ headless: false });
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
    const useVision = isVisionAvailable() && /figma\.com\/proto|embed\.figma\.com\/proto/i.test(task.url);
    // Always clip screenshots to the interaction frame (prototype area only)
    const previousActions = [];
    if (useVision) {
      console.log("[run] Vision mode enabled (model:", process.env.SINTETICOS_VISION_MODEL || "claude-haiku-4-5-20251001", ")");
    }
    let previousFingerprint = await safeFingerprintPage(page);
    let currentScreen = await safeGetScreenLabel(page, 1);
    context.currentScreen = currentScreen;
    await safeCaptureScreenshot(page, runDir, screenshots, currentScreen, 1, runId, context.interactionFrame);
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
        await safeCaptureScreenshot(page, runDir, screenshots, currentScreen, step + 1, runId, context.interactionFrame);
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
        await safeCaptureScreenshot(page, runDir, screenshots, currentScreen, step + 1, runId, context.interactionFrame);
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
        await safeCaptureScreenshot(page, runDir, screenshots, currentScreen, step + 1, runId, context.interactionFrame);
        break;
      }

      const activeFrame = (await getInteractionFrame(page, task)) || context.interactionFrame;
      if (activeFrame) {
        context.interactionFrame = activeFrame;
      }

      // --- Decision: vision or DOM candidates ---
      let plan = null;

      if (useVision) {
        try {
          const visionClip = activeFrame || context.interactionFrame;
          const visionScreenshotOpts = { type: "png" };
          if (visionClip && visionClip.confidence > 0.5 && visionClip.left >= 0) {
            visionScreenshotOpts.clip = {
              x: visionClip.left, y: visionClip.top,
              width: visionClip.width, height: visionClip.height
            };
          }
          const screenshotBuffer = await page.screenshot(visionScreenshotOpts);
          const visionResult = await analyzeScreenWithVision(screenshotBuffer, {
            task, persona, step, previousActions
          });
          if (visionResult) {
            const pageCoords = mapVisionCoordsToPage(visionResult.x, visionResult.y, visionClip);
            plan = {
              type: "vision",
              x: pageCoords.x,
              y: pageCoords.y,
              centerX: pageCoords.x,
              centerY: pageCoords.y,
              frameX: visionResult.x,
              frameY: visionResult.y,
              reason: visionResult.reason,
              score: visionResult.certainty,
              screenDescription: visionResult.screenDescription,
              taskComplete: visionResult.taskComplete
            };
            previousActions.push(`Step ${step}: ${visionResult.reason} at (${visionResult.x}, ${visionResult.y})`);
          }
        } catch (visionError) {
          console.error("[run] Vision error, falling back to DOM:", visionError.message);
        }
      }

      if (!plan) {
        const candidates = await collectCandidates(page, activeFrame);
        plan = chooseCandidate(candidates, task, persona, rng, step, activeFrame);
      }

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

      // --- Click ---
      await page.mouse.click(plan.centerX || plan.x, plan.centerY || plan.y);

      await page.waitForTimeout(Math.min(1200, timing.interactiveWaitMs));
      const nextFingerprint = await safeFingerprintPage(page);
      const nextScreen = plan.screenDescription || await safeGetScreenLabel(page, step + 1);
      const certainty = Math.max(40, Math.min(92, Math.round(plan.score || 64)));
      const frameRef = activeFrame || context.interactionFrame;
      const point = {
        x: plan.frameX != null
          ? Math.round(plan.frameX)
          : frameRef
            ? Math.round((plan.centerX || plan.x) - frameRef.left)
            : Math.round(plan.centerX || plan.x),
        y: plan.frameY != null
          ? Math.round(plan.frameY)
          : frameRef
            ? Math.round((plan.centerY || plan.y) - frameRef.top)
            : Math.round(plan.centerY || plan.y),
        step,
        screen: currentScreen,
        certainty,
        weight: certainty / 100
      };
      clickPoints.push(point);
      stepLog.push({
        step,
        screen: currentScreen,
        action: plan.type === "vision" ? "click_vision" : plan.type === "candidate" ? "click_text" : "click_region",
        reason: plan.reason,
        certainty,
        timestamp: new Date().toISOString()
      });

      const screenChanged = nextFingerprint !== previousFingerprint ||
        (plan.type === "vision" && plan.screenDescription && plan.screenDescription !== currentScreen);
      if (screenChanged) {
        screenTransitions.push({ from: currentScreen, to: nextScreen, step });
        currentScreen = nextScreen;
        context.currentScreen = currentScreen;
        previousFingerprint = nextFingerprint;
      } else if (!useVision && step >= 2) {
        completionStatus = "abandoned";
        executionNotes = "La pantalla no cambio despues de intentos repetidos.";
        await safeCaptureScreenshot(page, runDir, screenshots, currentScreen, step + 1, runId, context.interactionFrame);
        break;
      }

      await safeCaptureScreenshot(page, runDir, screenshots, currentScreen, step + 1, runId, context.interactionFrame);
      if (context.interactionFrame) {
        await writeFrameDebugArtifact(runDir, runId, currentScreen, context.interactionFrame, debugArtifacts, page.viewportSize());
      }

      if (plan.taskComplete && certainty >= 60) {
        completionStatus = "completed";
        break;
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
      engine: useVision ? "playwright-vision" : "playwright",
      execution_notes: useVision
        ? "Navegacion real con Playwright + Claude Vision API para analisis de canvas."
        : executionNotes,
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
