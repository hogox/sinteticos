import {
  DEFAULT_RUN_TIMEOUT_MS,
  DEFAULT_SURFACE_TIMEOUT_MS,
  DEFAULT_FIGMA_INTERACTIVE_WAIT_MS,
  DEFAULT_INITIAL_WAIT_MS,
  DEFAULT_PAGE_ACTION_TIMEOUT_MS,
  DEFAULT_PAGE_NAVIGATION_TIMEOUT_MS,
  DEFAULT_GOTO_TIMEOUT_MS,
  DEFAULT_STARTUP_GRACE_MS,
  DEFAULT_BLIND_WAKE_POINTS
} from "./config.ts";
import { escapeRegExp } from "./utils.ts";
import { safeGetScreenLabel, safeCaptureScreenshot } from "./page-inspect.ts";
import { writeFrameDebugArtifact } from "./frame-detection.ts";
import { collectCandidates } from "./candidates.ts";
import {
  composePersonaResponse,
  summarizeRun,
  buildFindings,
  buildFollowUps,
  buildPredictedPoints,
  buildPredictiveNotes
} from "../shared/reporting.js";

export async function prepareFigmaSurface(page) {
  const buttonTargets = [
    "Allow all cookies",
    "Do not allow cookies",
    "Allow cookies",
    "Permitir todas las cookies",
    "No permitir cookies",
    "Configuración de cookies",
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
      } catch (error: any) {
      }
    }
  }

  // CSS fallback for cookie buttons that don't expose accessible names
  try {
    const cookieFallback = page.locator('button:has-text("cookies")').first();
    if (await cookieFallback.count()) {
      await cookieFallback.click({ timeout: 1200 });
      await page.waitForTimeout(500);
    }
  } catch (error: any) {
  }

  // Search for cookie buttons inside iframes (Figma embeds)
  try {
    const cookieTargets = buttonTargets.slice(0, 6); // cookie-related labels only
    const frames = page.frames();
    for (const frame of frames) {
      if (frame === page.mainFrame()) continue;
      for (const label of cookieTargets) {
        const btn = frame.getByRole("button", { name: new RegExp(escapeRegExp(label), "i") }).first();
        if (await btn.count()) {
          await btn.click({ timeout: 1200 });
          await page.waitForTimeout(500);
          return;
        }
      }
    }
  } catch (error: any) {
  }

}

export async function settleFigmaSurface(page, deadline, timing = resolveNavigationTiming(), task = {}) {
  const { getInteractionFrame } = await import("./figma-advanced.ts");
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
          } catch (error: any) {
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
        } catch (error: any) {
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

export async function inspectBlockingSurface(page) {
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
      text.includes("cookie settings") ||
      text.includes("permitir todas las cookies") ||
      text.includes("no permitir cookies") ||
      text.includes("configuración de cookies");
    const hasRestartButton = text.includes("restart");
    const hasCanvas = document.querySelectorAll("canvas").length > 0;
    const hasIframe = document.querySelectorAll("iframe").length > 0;
    const hasLoadingSurface =
      (!hasRestartButton &&
        !hasCanvas &&
        !hasIframe &&
        onlyShortText.length < 80 &&
        document.querySelectorAll("svg").length > 0 &&
        document.querySelectorAll("button").length <= 2) ||
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

export async function hasMeaningfulInteractiveTargets(page, interactionFrame = null) {
  const candidates = await collectCandidates(page, interactionFrame);
  return candidates.some((candidate) => !candidate.isRestart && (candidate.text || candidate.width >= 44 || candidate.height >= 44));
}

export async function buildBlockedRun(task, persona, startedAt, seed, runId, rng, reason, executionNotes, runDir, page) {
  const { getInteractionFrame, safeViewportSize } = await import("./figma-advanced.ts");
  const screen = await safeGetScreenLabel(page, 1);
  const screenshots = [];
  const debugArtifacts = [];
  const interactionFrame = await getInteractionFrame(page, task);
  await safeCaptureScreenshot(page, runDir, screenshots, screen, 1, runId, interactionFrame);
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

export function resolveNavigationTiming(task: any = {}) {
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

export function sanitizeTimeout(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

export function normalizeBlindWakePoints(rawPoints) {
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
