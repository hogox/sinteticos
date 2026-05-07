import path from "node:path";
import { promises as fs } from "node:fs";
import { ARTIFACTS_DIR, BROWSER_HEADLESS } from "./config.mjs";
import { uid } from "./utils.mjs";
import { hashString, mulberry32 } from "../shared/utils.js";
import { simulateRun } from "../shared/simulation.js";
import { analyzeFirstImpression, isVisionAvailable } from "./vision.mjs";

export async function executeFiveSecondTestRun(task, persona, iteration, playwright) {
  if (!playwright) {
    return simulateRun(task, persona, iteration, {
      uid,
      overrides: { engine: "server-simulated", source: "server" },
      executionNotes: "Playwright no esta instalado. Five-second-test fallback simulado."
    });
  }

  const runId = uid("run");
  const startedAt = new Date();
  const seed = hashString(`${task.id}:${persona.id}:${iteration}:${startedAt.toISOString()}`).toString().slice(0, 6);
  const rng = mulberry32(Number(seed));
  const runDir = path.join(ARTIFACTS_DIR, runId);
  await fs.mkdir(runDir, { recursive: true });

  const viewportWidth = task.viewport_width || 1280;
  const viewportHeight = task.viewport_height || 800;

  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: BROWSER_HEADLESS });
    const page = await browser.newPage({ viewport: { width: viewportWidth, height: viewportHeight } });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    await page.goto(task.url, { waitUntil: "domcontentloaded", timeout: 25000 });
    try { await page.waitForLoadState("networkidle", { timeout: 8000 }); } catch {}
    await page.waitForTimeout(2000);

    const screenshotPath = path.join(runDir, "step-01.png");
    const screenshotBuffer = await page.screenshot({ path: screenshotPath, type: "png", fullPage: false });
    const title = await page.title().catch(() => "Pantalla inicial");

    const screen = (title || "Pantalla inicial").slice(0, 60);
    const screenshots = [{ src: `/artifacts/${runId}/step-01.png`, screen, step: 1 }];

    let firstImpression = null;
    if (isVisionAvailable()) {
      firstImpression = await analyzeFirstImpression(screenshotBuffer, { task, persona });
    }

    const attentionPoints = (firstImpression?.attentionPoints || []).map((p) => ({
      x: p.x, y: p.y, weight: p.weight, screen, step: 1, label: p.label
    }));
    const scanpathPoints = (firstImpression?.scanpath || []).map((p) => ({
      x: p.x, y: p.y, order: p.order, screen, step: 1, weight: 0.7
    }));

    const completionStatus = firstImpression ? "completed" : "uncertain";
    const reasonText = firstImpression?.firstImpression || "No pude analizar la pantalla con vision (sin API key o fallo).";
    const stepLog = [{
      step: 1,
      screen,
      action: "first_impression",
      reason: reasonText,
      certainty: firstImpression?.taskRelevance ?? 50,
      timestamp: new Date().toISOString()
    }];

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
      persona_response: firstImpression?.firstImpression || "",
      step_log: stepLog,
      click_points: [],
      screen_transitions: [],
      screenshots,
      debug_artifacts: [],
      observed_heatmaps: [{ screen, points: attentionPoints }],
      observed_scanpaths: [{ screen, points: scanpathPoints }],
      predicted_attention_maps: [{
        screen,
        points: attentionPoints,
        notes: [
          firstImpression?.understoodPurpose || "Sin interpretación de propósito.",
          `Relevancia para la tarea: ${firstImpression?.taskRelevance ?? "—"}%`
        ]
      }],
      report_summary: firstImpression
        ? `Primera impresión (5s): ${firstImpression.understoodPurpose}`
        : "No se pudo generar primera impresión.",
      report_details: {
        primary_screen: screen,
        prioritized_findings: [],
        trust_signals: [],
        rejection_signals: [],
        first_impression: firstImpression
      },
      follow_up_questions: [],
      engine: "playwright-five-second",
      execution_notes: "Five-second test: una captura inicial + análisis predictivo de atención.",
      mcp_enabled: false,
      source: "server-playwright",
      lighthouse: null
    };
  } catch (error) {
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
      persona_response: "",
      step_log: [{
        step: 1, screen: "Error", action: "abandon",
        reason: `Error abriendo URL: ${error.message}`,
        certainty: 0, timestamp: new Date().toISOString()
      }],
      click_points: [], screen_transitions: [], screenshots: [],
      debug_artifacts: [], observed_heatmaps: [], observed_scanpaths: [],
      predicted_attention_maps: [],
      report_summary: `Error: ${error.message}`,
      report_details: { primary_screen: "Error", prioritized_findings: [], trust_signals: [], rejection_signals: [] },
      follow_up_questions: [],
      engine: "playwright-five-second",
      execution_notes: `Error: ${error.message}`,
      source: "server-playwright"
    };
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
}
