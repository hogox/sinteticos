import path from "node:path";
import { promises as fs } from "node:fs";
import { ARTIFACTS_DIR, BROWSER_HEADLESS, ABSOLUTE_MAX_STEPS } from "./config.ts";
import { isFigmaUrl } from "./url-utils.ts";
import { uid } from "./utils.ts";
import { hashString, mulberry32 } from "../shared/utils.js";
import {
  composePersonaResponse,
  summarizeRun,
  buildFindings,
  buildFollowUps,
  buildPredictedPoints,
  buildPredictiveNotes
} from "../shared/reporting.js";
import { safeFingerprintPage, safeCaptureScreenshot, safeGetScreenLabel } from "./page-inspect.ts";
import { writeFrameDebugArtifact } from "./frame-detection.ts";
import { collectCandidates, chooseCandidate } from "./candidates.ts";
import {
  settleFigmaSurface,
  buildBlockedRun,
  resolveNavigationTiming
} from "./figma-surface.ts";
import {
  extendFigmaStartupWindow,
  attemptBlindWakeSequence,
  getInteractionFrame,
  refineFrameByPixelAnalysis,
  looksSuccessful,
  safeViewportSize
} from "./figma-advanced.ts";
import { buildRecoveredErrorRun } from "./error-runs.ts";
import { simulateRun } from "../shared/simulation.js";
import { isVisionAvailable, analyzeScreenWithVision, mapVisionCoordsToPage } from "./vision.ts";
import { waitAndSolveHumanChallenge, detectAndSolveHumanChallenge } from "./human-challenge.ts";

const CLOUDFLARE_RE = /just a moment|managed challenge|un momento|checking your browser|enable javascript and cookies/i;

async function surveyPageScroll(
  page: any,
  runDir: string,
  screenshots: any[],
  runId: string,
  currentScreen: string,
  interactionFrame: any
): Promise<number> {
  const pageHeight: number = await page.evaluate(() => document.documentElement.scrollHeight);
  const vpHeight: number = (page.viewportSize()?.height) || 800;
  if (pageHeight <= vpHeight * 1.2) return 0;

  const scrollStep = Math.round(vpHeight * 0.75);
  const maxPositions = 3;
  let surveyed = 0;

  for (let i = 1; i <= maxPositions; i++) {
    await page.mouse.wheel(0, scrollStep);
    await page.waitForTimeout(400);

    const atBottom: boolean = await page.evaluate(
      () => (window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 50
    );

    const surveyFilename = `survey-${String(i).padStart(2, "0")}.png`;
    const opts: any = { path: path.join(runDir, surveyFilename), fullPage: false };
    if (interactionFrame && interactionFrame.confidence > 0.5) {
      opts.clip = {
        x: interactionFrame.left, y: interactionFrame.top,
        width: interactionFrame.width, height: interactionFrame.height
      };
    }
    try {
      await page.screenshot(opts);
      screenshots.push({
        screen: `${currentScreen} (survey-${i})`,
        step: 0,
        src: `/artifacts/${runId}/${surveyFilename}`
      });
      surveyed++;
    } catch { /* screenshot fallida no bloquea */ }

    if (atBottom) break;
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  return surveyed;
}

async function waitForCloudflare(page, extraWaitMs = 1000) {
  try {
    const title = await page.title().catch(() => "");
    if (!CLOUDFLARE_RE.test(title)) return;
    console.log("[run] Cloudflare challenge detectado — esperando resolucion (max 18s)...");
    await page.waitForFunction(
      () => !/just a moment|managed challenge|un momento|checking your browser|enable javascript and cookies/i.test(document.title),
      { timeout: 18000 }
    ).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(extraWaitMs);
  } catch {
    // ignore
  }
}

export async function executeNavigationRun(task: any, persona: any, iteration: number, playwright: any, options: any = {}) {
  const project = options.project || null;
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
  const context: any = {
    currentScreen: "Run bootstrap",
    screenshots,
    stepLog,
    clickPoints,
    screenTransitions,
    interactionFrame: null,
    debugArtifacts,
    viewport: null
  };

  const isFigma = isFigmaUrl(task.url);
  let browser;
  let completionStatus = "completed";
  let executionNotes = isFigma
    ? "Navegacion real con Playwright."
    : "Navegacion real con Playwright sobre sitio web (modo visible).";
  let usedBlindWake = false;

  try {
    // Web runs always use visible browser — Cloudflare Managed Challenge cannot be solved in headless mode
    browser = await playwright.chromium.launch({ headless: isFigma ? BROWSER_HEADLESS : false });
    const viewportWidth = isFigma ? 390 : (task.viewport_width || 1280);
    const viewportHeight = isFigma ? 844 : (task.viewport_height || 800);
    let page = await browser.newPage({ viewport: { width: viewportWidth, height: viewportHeight } });
    context.page = page;
    context.viewport = page.viewportSize();
    page.setDefaultTimeout(timing.pageActionTimeoutMs);
    page.setDefaultNavigationTimeout(timing.pageNavigationTimeoutMs);
    if (!isFigma) {
      // Basic stealth: hide webdriver flag read by Cloudflare and other bot-detection scripts
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
        const w = window as any;
        delete w.cdc_adoQpoasnfa76pfcZLmcfl_Array;
        delete w.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
        delete w.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
      });
    }
    let navUrl = task.url;
    if (isFigma && /embed\.figma\.com\/proto/i.test(navUrl)) {
      navUrl = navUrl.replace(/[?&]show-proto-sidebar=\d/gi, "");
    }
    await page.goto(navUrl, { waitUntil: "domcontentloaded", timeout: timing.gotoTimeoutMs });
    if (isFigma) {
      await page.waitForTimeout(timing.initialWaitMs);
    } else {
      try {
        await page.waitForLoadState("networkidle", { timeout: 8000 });
      } catch {
        await page.waitForTimeout(timing.initialWaitMs);
      }
      // Wait for any Cloudflare challenge on the initial page load to auto-resolve
      await waitForCloudflare(page, timing.initialWaitMs);
      // Also handle interactive challenges (Turnstile checkbox, hCaptcha, reCAPTCHA)
      const initialChallenge = await waitAndSolveHumanChallenge(page, 10000);
      if (initialChallenge.found) {
        await waitForCloudflare(page, 1500);
      }
    }
    let initialSurface = isFigma
      ? await settleFigmaSurface(page, deadline, timing, task)
      : { kind: "clear" };
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
    context.interactionFrame = await refineFrameByPixelAnalysis(page, context.interactionFrame);
    // Vision is default for web (when API key + not explicitly disabled).
    // For Figma, vision still requires the existing path.
    const useVision = isVisionAvailable() && (isFigma || task.vision_enabled !== false);
    // Always clip screenshots to the interaction frame (prototype area only)
    const previousActions = [];
    const clickedTexts = new Set();
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

    // Survey inicial: scrollear toda la página para ver contenido below-the-fold antes de interactuar
    if (!isFigma) {
      const surveyCount = await surveyPageScroll(page, runDir, screenshots, runId, currentScreen, context.interactionFrame);
      if (surveyCount > 0) {
        previousActions.push(
          `[Exploración previa] Recorrí la página con scroll y vi ${surveyCount} posición(es) adicional(es) de contenido below-the-fold antes de interactuar.`
        );
      }
    }

    const isUnlimited = task.max_steps == null || task.max_steps === 0;
    const effectiveMax = isUnlimited ? ABSOLUTE_MAX_STEPS : task.max_steps;
    for (let step = 1; step <= effectiveMax; step += 1) {
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

      const guardrailStatus = isFigma
        ? await settleFigmaSurface(page, deadline, timing, task)
        : { kind: "clear" };
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

      // Re-detect frame but only replace if quality is equal or better
      const freshFrame = await getInteractionFrame(page, task);
      let activeFrame = context.interactionFrame;
      if (freshFrame && (!activeFrame || freshFrame.confidence >= activeFrame.confidence)) {
        activeFrame = freshFrame;
      }
      // Re-run pixel analysis on the selected frame each step (not stale delta)
      if (activeFrame) {
        activeFrame = await refineFrameByPixelAnalysis(page, activeFrame);
        context.interactionFrame = activeFrame;
      }

      // --- Decision: vision or DOM candidates ---
      let plan = null;

      if (useVision) {
        try {
          const visionClip = activeFrame || context.interactionFrame;
          const visionScreenshotOpts: any = { type: "png" };
          if (visionClip && visionClip.confidence > 0.3 && visionClip.left >= 0 && visionClip.width > 100 && visionClip.height > 200) {
            visionScreenshotOpts.clip = {
              x: visionClip.left, y: visionClip.top,
              width: visionClip.width, height: visionClip.height
            };
          }
          const screenshotBuffer = await page.screenshot(visionScreenshotOpts);
          const visionResult = await analyzeScreenWithVision(screenshotBuffer, {
            task, persona, step, previousActions, runSeed: seed, project
          });
          if (visionResult) {
            if (visionResult.action === "click") {
              const pageCoords = mapVisionCoordsToPage(visionResult.x, visionResult.y, visionClip);
              plan = {
                type: "vision",
                action: "click",
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
              previousActions.push(`Paso ${step} (click): ${visionResult.reason}`);
            } else {
              plan = {
                type: "vision",
                action: visionResult.action,
                reason: visionResult.reason,
                score: visionResult.certainty,
                screenDescription: visionResult.screenDescription,
                taskComplete: visionResult.taskComplete
              };
              previousActions.push(`Paso ${step} (${visionResult.action}): ${visionResult.reason}`);
            }
          }
        } catch (visionError) {
          console.error("[run] Vision error, falling back to DOM:", visionError.message);
        }
      }

      if (!plan) {
        const candidateOpts = { isFigma };
        let candidates = await collectCandidates(page, activeFrame, candidateOpts);
        if (!isFigma && candidates.length === 0) {
          // Scroll down and retry — content may be below the fold
          for (let scrollAttempt = 0; scrollAttempt < 2 && candidates.length === 0; scrollAttempt++) {
            await page.mouse.wheel(0, 400);
            await page.waitForTimeout(600);
            candidates = await collectCandidates(page, activeFrame, candidateOpts);
          }
        }
        plan = chooseCandidate(candidates, task, persona, rng, step, activeFrame, context.viewport, clickedTexts);
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

      // --- Execute plan: click / scroll / back / linger / complete / abandon ---
      const planAction = plan.action || (plan.type === "candidate" ? "click" : plan.type === "vision" ? "click" : "click");
      const certainty = Math.max(40, Math.min(92, Math.round(plan.score || 64)));
      const emotion = plan.emotion || "neutral";

      if (planAction === "abandon") {
        completionStatus = "abandoned";
        stepLog.push({
          step, screen: currentScreen, action: "abandon",
          reason: plan.reason || "No encontré nada relevante en esta pantalla.",
          certainty, emotion, timestamp: new Date().toISOString()
        });
        await safeCaptureScreenshot(page, runDir, screenshots, currentScreen, step + 1, runId, context.interactionFrame);
        break;
      }

      if (planAction === "linger") {
        stepLog.push({
          step, screen: currentScreen, action: "linger",
          reason: plan.reason || "Me quedé mirando, intentando entender la pantalla.",
          certainty, emotion, timestamp: new Date().toISOString()
        });
        await page.waitForTimeout(600);
        await safeCaptureScreenshot(page, runDir, screenshots, currentScreen, step + 1, runId, context.interactionFrame);
        if (step === effectiveMax) {
          completionStatus = "uncertain";
          if (isUnlimited) executionNotes = `Se alcanzó el cap absoluto de ${ABSOLUTE_MAX_STEPS} pasos.`;
        }
        continue;
      }

      if (planAction === "complete") {
        completionStatus = "completed";
        stepLog.push({
          step, screen: currentScreen, action: "complete",
          reason: plan.reason || "Llegué a un estado que parece de éxito.",
          certainty, emotion, timestamp: new Date().toISOString()
        });
        await safeCaptureScreenshot(page, runDir, screenshots, currentScreen, step + 1, runId, context.interactionFrame);
        break;
      }

      if (planAction === "scroll") {
        const vp = page.viewportSize();
        await page.mouse.wheel(0, Math.round((vp?.height || 800) * 0.8));
        await page.waitForTimeout(700);
        const scrollScreen = `${currentScreen} (scroll)`;
        stepLog.push({
          step, screen: scrollScreen, action: "scroll",
          reason: plan.reason || "Hago scroll para ver más contenido.",
          certainty, emotion, timestamp: new Date().toISOString()
        });
        await safeCaptureScreenshot(page, runDir, screenshots, scrollScreen, step + 1, runId, context.interactionFrame);
        if (step === effectiveMax) {
          completionStatus = "uncertain";
          if (isUnlimited) executionNotes = `Se alcanzó el cap absoluto de ${ABSOLUTE_MAX_STEPS} pasos.`;
        }
        continue;
      }

      if (planAction === "back") {
        try { await page.goBack({ waitUntil: "domcontentloaded", timeout: 4000 }); } catch {}
        await page.waitForTimeout(800);
        const backScreen = await safeGetScreenLabel(page, step + 1);
        stepLog.push({
          step, screen: backScreen, action: "back",
          reason: plan.reason || "Vuelvo atrás, esta sección no es lo que busco.",
          certainty, emotion, timestamp: new Date().toISOString()
        });
        currentScreen = backScreen;
        context.currentScreen = currentScreen;
        await safeCaptureScreenshot(page, runDir, screenshots, currentScreen, step + 1, runId, context.interactionFrame);
        if (step === effectiveMax) {
          completionStatus = "uncertain";
          if (isUnlimited) executionNotes = `Se alcanzó el cap absoluto de ${ABSOLUTE_MAX_STEPS} pasos.`;
        }
        continue;
      }

      // --- Click ---
      if (plan.type === "candidate" && plan.text) clickedTexts.add(plan.text);

      // Si el candidato elegido está below-the-fold, scrollear hasta él antes de clickear
      let clickX = plan.centerX || plan.x;
      let clickY = plan.centerY || plan.y;
      if (!isFigma && plan.belowFold && plan.absoluteTop != null) {
        const vpH: number = page.viewportSize()?.height || 800;
        const targetScrollY = Math.max(0, plan.absoluteTop - Math.round(vpH * 0.35));
        await page.evaluate((y: number) => window.scrollTo({ top: y, behavior: "instant" }), targetScrollY);
        await page.waitForTimeout(350);
        clickY = plan.absoluteTop + (plan.height || 0) / 2 - targetScrollY;
      }
      await page.mouse.click(clickX, clickY);

      if (isFigma) {
        await page.waitForTimeout(Math.min(1200, timing.interactiveWaitMs));
      } else {
        try {
          await page.waitForLoadState("networkidle", { timeout: 4000 });
        } catch {
          await page.waitForTimeout(1500);
        }
        await waitForCloudflare(page, 1000);
        // Check for interactive challenge that may appear after navigation
        const postClickChallenge = await detectAndSolveHumanChallenge(page);
        if (postClickChallenge.found) {
          await waitForCloudflare(page, 1500);
        }
      }
      const nextFingerprint = await safeFingerprintPage(page);
      const nextScreen = plan.screenDescription || await safeGetScreenLabel(page, step + 1);
      const frameRef = activeFrame || context.interactionFrame;
      const point = {
        x: plan.frameX != null
          ? Math.round(Math.max(0, Math.min(plan.frameX, frameRef ? frameRef.width : plan.frameX)))
          : frameRef
            ? Math.round(Math.max(0, Math.min((plan.centerX || plan.x) - frameRef.left, frameRef.width)))
            : Math.round(plan.centerX || plan.x),
        y: plan.frameY != null
          ? Math.round(Math.max(0, Math.min(plan.frameY, frameRef ? frameRef.height : plan.frameY)))
          : frameRef
            ? Math.round(Math.max(0, Math.min((plan.centerY || plan.y) - frameRef.top, frameRef.height)))
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
        emotion,
        timestamp: new Date().toISOString()
      });

      const screenChanged = nextFingerprint !== previousFingerprint ||
        (plan.type === "vision" && plan.screenDescription && plan.screenDescription !== currentScreen);
      if (screenChanged) {
        screenTransitions.push({ from: currentScreen, to: nextScreen, step });
        currentScreen = nextScreen;
        context.currentScreen = currentScreen;
        previousFingerprint = nextFingerprint;
        // Survey de la nueva página: el agente recorre el contenido antes del próximo paso
        if (!isFigma) {
          const surveyCount = await surveyPageScroll(page, runDir, screenshots, runId, currentScreen, context.interactionFrame);
          if (surveyCount > 0) {
            previousActions.push(
              `[Exploración previa] Llegué a "${currentScreen}" y recorrí ${surveyCount} posición(es) de scroll para ver qué hay antes de decidir.`
            );
          }
        }
      } else if (!useVision && step >= 2 && isFigma) {
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

      if (step === effectiveMax) {
        completionStatus = "uncertain";
        if (isUnlimited) executionNotes = `Se alcanzó el cap absoluto de ${ABSOLUTE_MAX_STEPS} pasos.`;
      }
    }

    const findings = buildFindings(task, persona, completionStatus, rng, { stepLog, screenTransitions });
    const endedAt = new Date();

    let lighthouseData = null;
    if (task.lighthouse_enabled && task.url) {
      try {
        const { runLighthouse } = await import("./lighthouse-runner.ts");
        const formFactor = isFigma ? "mobile" : (task.lighthouse_form_factor || "desktop");
        lighthouseData = await runLighthouse(task.url, { formFactor });
      } catch (lhError) {
        console.error("[lighthouse] Error durante auditoria:", lhError.message);
      }
    }

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
      engine: useVision ? "playwright-vision" : isFigma ? "playwright" : "playwright-web",
      execution_notes: useVision
        ? "Navegacion real con Playwright + Claude Vision API para analisis de canvas."
        : executionNotes,
      mcp_enabled: task.mcp_enabled,
      source: "server-playwright",
      lighthouse: lighthouseData
    };
  } catch (error: any) {
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
