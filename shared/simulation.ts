import { hashString, mulberry32, getHostLabel } from "./utils.js";
import { buildScreenSvg } from "./screen-svg.js";
import {
  composeStepReason,
  composePersonaResponse,
  summarizeRun,
  buildFindings,
  buildFollowUps,
  buildPredictedPoints,
  buildPredictiveNotes,
  buildNavigationScreens
} from "./reporting.js";

interface SimTask {
  id: string;
  type?: string;
  url?: string;
  prompt?: string;
  success_criteria?: string;
  max_steps?: number | null;
  project_id?: string | null;
  mcp_enabled?: boolean;
  predictive_attention_enabled?: boolean;
  [k: string]: unknown;
}

interface SimPersona {
  id: string;
  name?: string;
  digital_level?: string;
  version?: number;
  project_id?: string | null;
  [k: string]: unknown;
}

interface SimulateRunOptions {
  uid: (prefix: string) => string;
  overrides?: {
    completion_status?: string;
    engine?: string;
    execution_notes?: string;
    source?: string;
  };
  svgOptions?: { extended?: boolean };
  useChooseAction?: boolean;
  engineLabel?: string;
  sourceLabel?: string;
  executionNotes?: string;
  timingMultiplier?: number;
  completionStrategy?: "client" | "server";
}

function chooseAction(task: SimTask, step: number, stepCount: number, rng: () => number, certainty: number): string {
  if (step === stepCount && certainty > 58) {
    return "complete";
  }
  if (certainty < 48 && rng() > 0.62) {
    return "abandon";
  }
  if (task.type === "idea") {
    return ["reflect", "question", "compare"][Math.floor(rng() * 3)];
  }
  return ["click_text", "click_region", "scroll", "wait"][Math.floor(rng() * 4)];
}

export function simulateRun(task: SimTask, persona: SimPersona, iteration: number, options: SimulateRunOptions) {
  const {
    uid,
    overrides = {},
    svgOptions = {},
    useChooseAction = true,
    engineLabel = "browser-simulated",
    sourceLabel = "client-local",
    executionNotes = "Fallback local sin backend ni Playwright.",
    timingMultiplier = 9500,
    completionStrategy = "client"
  } = options;

  const startedAt = new Date();
  const seed = hashString(`${task.id}:${persona.id}:${iteration}:${startedAt.toISOString()}`).toString().slice(0, 6);
  const rng = mulberry32(Number(seed));
  const stepCount = Math.max(2, Math.min(task.max_steps || 5, Math.floor(rng() * 4) + 3));
  const hostLabel = getHostLabel(task.url || "figma.com");
  const screens = task.type === "navigation" ? buildNavigationScreens(task, rng, hostLabel) : ["Idea brief", "Reaction", "Follow-up"];
  const clickPoints: Array<{ x: number; y: number; step: number; screen: string; certainty: number; weight: number }> = [];
  const stepLog: Array<{ step: number; screen: string; action: string; reason: string; certainty: number; timestamp: string }> = [];
  const transitions: Array<{ from: string; to: string; step: number }> = [];
  const certaintyBase = persona.digital_level === "high" ? 84 : persona.digital_level === "medium" ? 68 : 52;
  let completionStatus = overrides.completion_status || "completed";

  for (let step = 1; step <= stepCount; step += 1) {
    const screen = screens[Math.min(step - 1, screens.length - 1)];
    const nextScreen = screens[Math.min(step, screens.length - 1)];
    const certainty = Math.max(28, Math.min(94, Math.round(certaintyBase - rng() * 18 + step * 2)));
    const x = 56 + Math.round(rng() * 248);
    const y = 130 + Math.round(rng() * 408);
    const action = useChooseAction
      ? chooseAction(task, step, stepCount, rng, certainty)
      : (task.type === "idea" ? "reflect" : "click_region");
    clickPoints.push({ x, y, step, screen, certainty, weight: useChooseAction ? Math.max(0.18, certainty / 100) : certainty / 100 });
    stepLog.push({
      step,
      screen,
      action,
      reason: composeStepReason(persona, task, action, screen, certainty),
      certainty,
      timestamp: new Date(startedAt.getTime() + step * timingMultiplier).toISOString()
    });
    if (screen !== nextScreen) {
      transitions.push({ from: screen, to: nextScreen, step });
    }
  }

  if (!overrides.completion_status) {
    if (completionStrategy === "client") {
      if (persona.digital_level === "low" && rng() > 0.52) {
        completionStatus = "abandoned";
      } else if (rng() > 0.72) {
        completionStatus = "uncertain";
      }
    } else {
      if (rng() > 0.68) {
        completionStatus = "uncertain";
      }
    }
  }

  const findings = buildFindings(task, persona, completionStatus, rng);
  const endedAt = completionStrategy === "client"
    ? new Date(startedAt.getTime() + stepCount * (9000 + Math.floor(rng() * 2500)))
    : new Date(startedAt.getTime() + stepCount * 9000);
  const screenshots = screens.map((screen, index) => ({
    screen,
    step: index + 1,
    src: buildScreenSvg(screen, task, persona, index, svgOptions)
  }));

  const trustSignals = completionStrategy === "client"
    ? [
        "Mensajes explicitos de avance",
        "Call to action visible en la zona superior",
        "Menor carga cognitiva cuando el siguiente paso se entiende rapido"
      ]
    : ["Mensajes explicitos de avance", "Call to action visible", "Progreso legible"];

  const rejectionSignals = completionStrategy === "client"
    ? [
        "Etiquetas ambiguas",
        "Demasiadas decisiones juntas",
        "Baja claridad sobre lo que pasa despues"
      ]
    : ["Etiquetas ambiguas", "Demasiadas decisiones juntas", "Baja claridad del siguiente paso"];

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
      trust_signals: trustSignals,
      rejection_signals: rejectionSignals
    },
    follow_up_questions: buildFollowUps(task, completionStatus),
    engine: overrides.engine || engineLabel,
    execution_notes: overrides.execution_notes || executionNotes,
    mcp_enabled: task.mcp_enabled,
    source: overrides.source || sourceLabel
  };
}
