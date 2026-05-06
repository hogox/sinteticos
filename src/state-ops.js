import { getState, setState, getUi } from "./store.js";
import { uid } from "./utils.js";
import { getPersonaById, getProjectById, getTaskById, getRunById } from "./utils.js";
import { STORAGE_KEY } from "./constants.js";
import { simulateRun } from "../shared/simulation.js";
import { buildInitialState } from "../shared/seed-data.js";
import { buildLocalPersonaReply } from "../shared/persona-chat.js";

export function localCreateProject(payload) {
  const state = getState();
  const now = new Date().toISOString();
  const project = {
    id: uid("project"),
    name: payload.name || "Proyecto sin nombre",
    description: payload.description || "",
    created_at: now,
    updated_at: now
  };
  return { ...state, projects: [project, ...(state.projects || [])] };
}

export function localUpdateProject(id, payload) {
  const state = getState();
  return {
    ...state,
    projects: (state.projects || []).map((item) =>
      item.id === id ? { ...item, ...payload, updated_at: new Date().toISOString() } : item
    )
  };
}

export function localDeleteProject(id) {
  const state = getState();
  const taskIds = state.tasks.filter((item) => item.project_id === id).map((item) => item.id);
  return {
    ...state,
    projects: (state.projects || []).filter((item) => item.id !== id),
    // Personas son top-level: sobreviven al borrado del proyecto.
    tasks: state.tasks.filter((item) => item.project_id !== id),
    runs: state.runs.filter((item) => item.project_id !== id && !taskIds.includes(item.task_id)),
    calibrations: state.calibrations.filter((item) => item.project_id !== id),
    persona_conversations: (state.persona_conversations || []).filter((item) => item.project_id !== id)
  };
}

export function localCreatePersona(payload) {
  const state = getState();
  const now = new Date().toISOString();
  const persona = {
    id: uid("persona"),
    ...payload,
    status: "active",
    version: 1,
    created_at: now,
    updated_at: now
  };
  return { ...state, personas: [persona, ...state.personas] };
}

export function localUpdatePersona(id, payload) {
  const state = getState();
  return {
    ...state,
    personas: state.personas.map((item) =>
      item.id === id ? { ...item, ...payload, version: item.version + 1, updated_at: new Date().toISOString() } : item
    )
  };
}

export function localDuplicatePersona(id) {
  const state = getState();
  const persona = getPersonaById(id, state);
  if (!persona) {
    return state;
  }
  const duplicate = {
    ...persona,
    id: uid("persona"),
    name: `${persona.name} Copy`,
    status: "draft",
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  return { ...state, personas: [duplicate, ...state.personas] };
}

export function localArchivePersona(id) {
  const state = getState();
  return {
    ...state,
    personas: state.personas.map((item) =>
      item.id === id ? { ...item, status: item.status === "archived" ? "active" : "archived", updated_at: new Date().toISOString() } : item
    )
  };
}

export function localDeletePersona(id) {
  const state = getState();
  return {
    ...state,
    personas: state.personas.filter((item) => item.id !== id),
    persona_conversations: (state.persona_conversations || []).filter((item) => item.persona_id !== id)
  };
}

export function localCreateTask(payload) {
  const state = getState();
  const task = {
    id: uid("task"),
    ...payload,
    status: "ready",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  return { ...state, tasks: [task, ...state.tasks] };
}

export function localUpdateTask(id, payload) {
  const state = getState();
  return {
    ...state,
    tasks: state.tasks.map((item) => (item.id === id ? { ...item, ...payload, updated_at: new Date().toISOString() } : item))
  };
}

export function localDeleteTask(id) {
  const state = getState();
  return { ...state, tasks: state.tasks.filter((item) => item.id !== id) };
}

export function localCreateRuns(taskId, personaId, runCount) {
  const state = getState();
  const task = state.tasks.find((item) => item.id === taskId);
  const persona = state.personas.find((item) => item.id === personaId);
  if (!task || !persona) {
    return state;
  }
  const newRuns = Array.from({ length: runCount }, (_, index) =>
    simulateRun(task, persona, index + 1, {
      uid,
      useChooseAction: true,
      engineLabel: "browser-simulated",
      sourceLabel: "client-local",
      executionNotes: "Fallback local sin backend ni Playwright.",
      completionStrategy: "client"
    })
  );
  return { ...state, runs: [...newRuns.reverse(), ...state.runs] };
}

export function localCreateCalibration(payload) {
  const state = getState();
  const calibration = { id: uid("calibration"), ...payload, created_at: new Date().toISOString() };
  return { ...state, calibrations: [calibration, ...state.calibrations] };
}

export function localDeleteRun(id) {
  const state = getState();
  return { ...state, runs: state.runs.filter((item) => item.id !== id) };
}

export function emptyState() {
  return { projects: [], personas: [], tasks: [], runs: [], calibrations: [], persona_conversations: [] };
}

export function localCreatePersonaConversation(personaId, payload = {}) {
  const state = getState();
  const persona = getPersonaById(personaId, state);
  if (!persona) {
    return state;
  }
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
  return { ...state, persona_conversations: [conversation, ...(state.persona_conversations || [])] };
}

export function localSendPersonaMessage(personaId, threadId, payload = {}) {
  const state = getState();
  const persona = getPersonaById(personaId, state);
  const thread = (state.persona_conversations || []).find((item) => item.id === threadId && item.persona_id === personaId);
  if (!persona || !thread) {
    return state;
  }
  const now = new Date().toISOString();
  const mode = payload.mode === "evidence" ? "evidence" : thread.mode || "free";
  const anchorRunId = payload.anchorRunId || thread.anchor_run_id || null;
  const project = thread.project_id ? getProjectById(thread.project_id, state) : null;
  const tasks = (state.tasks || []).filter((task) => task.persona_id === persona.id);
  const runs = (state.runs || []).filter((run) => run.persona_id === persona.id);
  const userMessage = {
    id: uid("msg"),
    role: "user",
    content: String(payload.content || "").trim(),
    created_at: now
  };
  const reply = buildLocalPersonaReply({
    persona,
    project,
    tasks,
    runs,
    message: userMessage.content,
    mode,
    anchorRunId,
    kind: thread.kind || "chat",
    history: thread.messages
  });
  const personaMessage = {
    id: uid("msg"),
    role: "persona",
    content: reply.reply,
    evidence_mode: reply.evidence_mode,
    reasoning_note: reply.reasoning_note,
    citations: reply.citations,
    verdict: reply.verdict || null,
    verdict_reason: reply.verdict_reason || null,
    conditions: reply.conditions || null,
    frictions: reply.frictions || null,
    created_at: new Date().toISOString()
  };
  const isFirstMessage = (thread.messages || []).length === 0;
  const newTitle =
    thread.kind === "hypothesis" && isFirstMessage ? userMessage.content.slice(0, 70) : thread.title;
  return {
    ...state,
    persona_conversations: (state.persona_conversations || []).map((item) =>
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
    )
  };
}

export function loadLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = buildInitialState(uid, (task, persona, iteration) =>
        simulateRun(task, persona, iteration, {
          uid,
          useChooseAction: true,
          engineLabel: "browser-simulated",
          sourceLabel: "client-local",
          executionNotes: "Fallback local sin backend ni Playwright.",
          completionStrategy: "client"
        })
      );
      persistLocalState(seeded);
      return seeded;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.persona_conversations)) {
      parsed.persona_conversations = [];
    }
    return parsed;
  } catch (error) {
    const seeded = buildInitialState(uid, (task, persona, iteration) =>
      simulateRun(task, persona, iteration, {
        uid,
        useChooseAction: true,
        engineLabel: "browser-simulated",
        sourceLabel: "client-local",
        executionNotes: "Fallback local sin backend ni Playwright.",
        completionStrategy: "client"
      })
    );
    persistLocalState(seeded);
    return seeded;
  }
}

export function persistLocalState(nextState) {
  setState(nextState);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}

export function ensureSelection() {
  const state = getState();
  const ui = getUi();
  if (ui.selectedProjectId && !getProjectById(ui.selectedProjectId, state)) {
    ui.selectedProjectId = null;
  }
  // Personas son globales: ya no filtramos por project.
  if (ui.selectedPersonaId && !getPersonaById(ui.selectedPersonaId, state)) {
    ui.selectedPersonaId = state.personas[0]?.id || null;
  }
  if (ui.personaDetailId && !getPersonaById(ui.personaDetailId, state)) {
    ui.personaDetailId = null;
  }
  if (!ui.selectedTaskId || !getTaskById(ui.selectedTaskId, state) || getTaskById(ui.selectedTaskId, state)?.project_id !== ui.selectedProjectId) {
    ui.selectedTaskId = state.tasks.find((item) => item.project_id === ui.selectedProjectId)?.id || null;
  }
  if (!ui.selectedRunId || !getRunById(ui.selectedRunId, state) || getRunById(ui.selectedRunId, state)?.project_id !== ui.selectedProjectId) {
    ui.selectedRunId = state.runs.find((item) => item.project_id === ui.selectedProjectId)?.id || null;
  }
}
