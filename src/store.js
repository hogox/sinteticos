let state = { projects: [], personas: [], tasks: [], runs: [], calibrations: [] };
let runtime = { mode: "loading", runner: "unknown", backend: false, mcp: "optional", skills: null };
let skillsCache = { list: [], loaded: false, analyzing: false, lastResult: null, lastRunId: null, lastSkill: null };
let ui = {
  section: "projects",
  selectedProjectId: null,
  selectedPersonaId: null,
  personaDetailId: null,
  selectedTaskId: null,
  selectedRunId: null,
  editingProjectId: null,
  editingPersonaId: null,
  editingTaskId: null,
  confirmation: null,
  runDetailView: "observed",
  personaCreateMode: "advanced",
  personaPreview: null,
  selectedConversationId: null,
  personaChatMode: "free",
  personaChatAnchorRunId: "",
  personaChatBusy: false,
  filters: {
    personaId: "all",
    taskId: "all",
    status: "all"
  }
};

export function getState() { return state; }
export function setState(next) { state = next; }
export function getRuntime() { return runtime; }
export function setRuntime(next) { Object.assign(runtime, next); }
export function getUi() { return ui; }
export function setUi(next) { Object.assign(ui, next); }
export function getSkillsCache() { return skillsCache; }
export function setSkillsCache(next) { Object.assign(skillsCache, next); }
