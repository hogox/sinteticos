import { simulateRun } from "../shared/simulation.js";
import { uid } from "./utils.mjs";
import { executeNavigationRun } from "./navigation-run.mjs";
import { buildErrorRun } from "./error-runs.mjs";

let playwrightModulePromise;

export async function getPlaywright() {
  if (playwrightModulePromise === undefined) {
    playwrightModulePromise = import("playwright").catch(() => null);
  }
  return playwrightModulePromise;
}

export async function executeRun(task, persona, iteration) {
  if (task.type === "navigation" && task.url) {
    const playwright = await getPlaywright();
    return executeNavigationRun(task, persona, iteration, playwright);
  }
  return simulateRun(task, persona, iteration, {
    uid,
    overrides: {
      engine: "server-simulated",
      source: "server"
    },
    useChooseAction: false,
    completionStrategy: "server",
    engineLabel: "server-simulated",
    sourceLabel: "server",
    executionNotes: "Simulacion ejecutada en el backend local."
  });
}

export async function safeExecuteRun(task, persona, iteration) {
  try {
    return await executeRun(task, persona, iteration);
  } catch (error) {
    console.error("Run failed and was converted to persisted error run:", error);
    return buildErrorRun(task, persona, iteration, error);
  }
}
