import { simulateRun } from "../shared/simulation.js";
import { uid } from "./utils.ts";
import { executeNavigationRun } from "./navigation-run.ts";
import { executeFiveSecondTestRun } from "./five-second-test.ts";
import { buildErrorRun } from "./error-runs.ts";
import { executeMcpNavigationRun } from "./figma-mcp-run.ts";
import { parseFigmaPrototypeUrl } from "../figma-mcp-client.ts";

let playwrightModulePromise;

export async function getPlaywright() {
  if (playwrightModulePromise === undefined) {
    playwrightModulePromise = import("playwright").catch(() => null);
  }
  return playwrightModulePromise;
}

export async function executeRun(task: any, persona: any, iteration: number, options: any = {}) {
  const project = options.project || null;
  if (task.type === "five_second_test" && task.url) {
    const playwright = await getPlaywright();
    return (executeFiveSecondTestRun as any)(task, persona, iteration, playwright, { project });
  }
  if (task.type === "navigation" && task.url) {
    const playwright = await getPlaywright();
    const figmaInfo = parseFigmaPrototypeUrl(task.url);
    const figmaToken = process.env.FIGMA_ACCESS_TOKEN || "";
    if (figmaInfo && task.mcp_enabled && figmaToken) {
      return (executeMcpNavigationRun as any)(task, persona, iteration, figmaToken, playwright, { project });
    }
    return (executeNavigationRun as any)(task, persona, iteration, playwright, { project });
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

export async function safeExecuteRun(task: any, persona: any, iteration: number, options: any = {}) {
  try {
    return await executeRun(task, persona, iteration, options);
  } catch (error: any) {
    console.error("Run failed and was converted to persisted error run:", error);
    return buildErrorRun(task, persona, iteration, error);
  }
}
