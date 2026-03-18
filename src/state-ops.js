import { getState, setState, getUi } from "./store.js";
import { uid } from "./utils.js";
import { getPersonaById, getProjectById, getTaskById, getRunById } from "./utils.js";
import { STORAGE_KEY } from "./constants.js";
import { simulateRun } from "../shared/simulation.js";
import { buildInitialState } from "../shared/seed-data.js";

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
  const personaIds = state.personas.filter((item) => item.project_id === id).map((item) => item.id);
  return {
    ...state,
    projects: (state.projects || []).filter((item) => item.id !== id),
    personas: state.personas.filter((item) => item.project_id !== id),
    tasks: state.tasks.filter((item) => item.project_id !== id),
    runs: state.runs.filter((item) => item.project_id !== id && !taskIds.includes(item.task_id) && !personaIds.includes(item.persona_id)),
    calibrations: state.calibrations.filter((item) => item.project_id !== id)
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
  return { ...state, personas: state.personas.filter((item) => item.id !== id) };
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
  return { projects: [], personas: [], tasks: [], runs: [], calibrations: [] };
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
    return JSON.parse(raw);
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
  if (!ui.selectedPersonaId || !getPersonaById(ui.selectedPersonaId, state) || getPersonaById(ui.selectedPersonaId, state)?.project_id !== ui.selectedProjectId) {
    ui.selectedPersonaId = state.personas.find((item) => item.project_id === ui.selectedProjectId)?.id || null;
  }
  if (!ui.selectedTaskId || !getTaskById(ui.selectedTaskId, state) || getTaskById(ui.selectedTaskId, state)?.project_id !== ui.selectedProjectId) {
    ui.selectedTaskId = state.tasks.find((item) => item.project_id === ui.selectedProjectId)?.id || null;
  }
  if (!ui.selectedRunId || !getRunById(ui.selectedRunId, state) || getRunById(ui.selectedRunId, state)?.project_id !== ui.selectedProjectId) {
    ui.selectedRunId = state.runs.find((item) => item.project_id === ui.selectedProjectId)?.id || null;
  }
}
