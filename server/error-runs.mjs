import { simulateRun } from "../shared/simulation.js";
import { uid } from "./utils.mjs";
import { buildFrameDebugDataUrl } from "./frame-detection.mjs";

export function buildErrorRun(task, persona, iteration, error, overrides = {}) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const fallback = simulateRun(task, persona, iteration, {
    uid,
    overrides: {
      engine: overrides.engine || "server-error",
      source: overrides.source || "server",
      completion_status: "error",
      execution_notes: overrides.execution_notes || `El run termino con error controlado: ${errorMessage}`
    },
    useChooseAction: false,
    completionStrategy: "server",
    engineLabel: overrides.engine || "server-error",
    sourceLabel: overrides.source || "server",
    executionNotes: overrides.execution_notes || `El run termino con error controlado: ${errorMessage}`
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

export function buildRecoveredErrorRun(task, persona, iteration, error, context, overrides = {}) {
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
