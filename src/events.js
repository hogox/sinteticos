import {
  onProjectSubmit,
  onPersonaSubmit,
  onTaskSubmit,
  onRunSubmit,
  onCalibrationSubmit,
  onPersonaChatSubmit,
  handleProjectAction,
  handlePersonaAction,
  handlePersonaDetailAction,
  handleTaskAction,
  handleRunAction
} from "./handlers.js";
import { getUi, getState, setSkillsCache, getSkillsCache } from "./store.js";
import { render } from "./render.js";
import { renderChatDrawer } from "./render-chat-drawer.js";
import { renderRuns, renderTasks } from "./render-entities.js";
import { api } from "./api.js";
import { renderDashboard } from "./render-dashboard.js";
import { resetProjectForm, resetPersonaForm, resetTaskForm } from "./forms.js";
import { closeConfirmation, closeErrorModal } from "./confirmation.js";
import { ensureSelection } from "./state-ops.js";
import { exportState, resetDemoData } from "./export.js";
import {
  setPersonaCreateMode,
  onPersonaSimpleSubmit,
  onPersonaUploadSubmit,
  resetSimpleForm,
  resetUploadForm,
  bindPersonaPreviewEvents,
  bindPersonaUploadEvents
} from "./persona-modes.js";
import { openPersonaModal, closePersonaModal } from "./persona-modal.js";

export function bindEvents() {
  document.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("submit", onDynamicSubmit);
  document.getElementById("project-form").addEventListener("submit", onProjectSubmit);
  document.getElementById("persona-form").addEventListener("submit", onPersonaSubmit);
  document.getElementById("task-form").addEventListener("submit", onTaskSubmit);
  document.getElementById("run-form").addEventListener("submit", onRunSubmit);
  document.getElementById("calibration-form").addEventListener("submit", onCalibrationSubmit);
  document.getElementById("project-reset").addEventListener("click", resetProjectForm);
  document.getElementById("create-persona-btn").addEventListener("click", openPersonaModal);
  document.getElementById("persona-modal-close").addEventListener("click", closePersonaModal);
  document.getElementById("persona-modal").addEventListener("click", (event) => {
    if (event.target.id === "persona-modal") closePersonaModal();
  });
  document.getElementById("persona-reset").addEventListener("click", resetPersonaForm);
  document.getElementById("persona-simple-form").addEventListener("submit", onPersonaSimpleSubmit);
  document.getElementById("persona-upload-form").addEventListener("submit", onPersonaUploadSubmit);
  document.getElementById("persona-simple-reset").addEventListener("click", resetSimpleForm);
  document.getElementById("persona-upload-reset").addEventListener("click", resetUploadForm);
  bindPersonaPreviewEvents();
  bindPersonaUploadEvents();
  document.getElementById("task-reset").addEventListener("click", resetTaskForm);
  document.getElementById("seed-demo").addEventListener("click", resetDemoData);
  document.getElementById("export-state").addEventListener("click", exportState);
  document.getElementById("chat-drawer-close").addEventListener("click", closeChatDrawer);
  document.getElementById("dashboard-filters").addEventListener("change", onFilterChange);
  document.getElementById("confirm-modal-cancel").addEventListener("click", () => closeConfirmation(false));
  document.getElementById("confirm-modal-confirm").addEventListener("click", () => closeConfirmation(true));
  document.getElementById("confirm-modal").addEventListener("click", (event) => {
    if (event.target.id === "confirm-modal") closeConfirmation(false);
  });
  document.getElementById("error-modal-close").addEventListener("click", closeErrorModal);
  document.getElementById("error-modal").addEventListener("click", (event) => {
    if (event.target.id === "error-modal") closeErrorModal();
  });
  window.addEventListener("keydown", (event) => {
    const ui = getUi();
    if (event.key === "Escape") {
      if (ui.chatDrawer?.open) { closeChatDrawer(); return; }
      const personaModal = document.getElementById("persona-modal");
      if (personaModal && !personaModal.classList.contains("hidden")) { closePersonaModal(); return; }
      if (ui.confirmation) closeConfirmation(false);
      else closeErrorModal();
    }
  });
}

function openChatDrawer(personaId) {
  const ui = getUi();
  ui.chatDrawer = { open: true, personaId, conversationId: null };
  renderChatDrawer();
}

function closeChatDrawer() {
  const ui = getUi();
  ui.chatDrawer = { ...ui.chatDrawer, open: false };
  renderChatDrawer();
}

function onDynamicSubmit(event) {
  if (event.target.id === "persona-chat-form") {
    onPersonaChatSubmit(event);
  }
}

async function handleSkillAnalyze() {
  const ui = getUi();
  const picker = document.getElementById("skill-picker");
  const providerPicker = document.getElementById("skill-provider-picker");
  if (!picker || !ui.selectedRunId) return;
  const skillName = picker.value;
  const provider = providerPicker?.value || undefined;
  setSkillsCache({ analyzing: true });
  renderRuns();
  try {
    const result = await api.runSkill(skillName, { runIds: [ui.selectedRunId], provider });
    setSkillsCache({ lastResult: result, lastRunId: ui.selectedRunId, lastSkill: skillName });
  } catch (error) {
    setSkillsCache({ lastResult: { ok: false, error: error.message }, lastRunId: ui.selectedRunId });
  }
  setSkillsCache({ analyzing: false });
  renderRuns();
}

async function handleSkillAnalyzeBatch() {
  const ui = getUi();
  const state = getState();
  const picker = document.getElementById("skill-batch-picker");
  const providerPicker = document.getElementById("skill-batch-provider-picker");
  if (!picker || !ui.selectedProjectId) return;
  const skillName = picker.value;
  const provider = providerPicker?.value || undefined;
  const projectRuns = state.runs.filter((r) => r.project_id === ui.selectedProjectId);
  if (!projectRuns.length) return;
  setSkillsCache({ analyzing: true });
  renderRuns();
  try {
    const result = await api.runSkill(skillName, { runIds: projectRuns.map((r) => r.id), provider });
    setSkillsCache({ lastResult: result, lastRunId: "batch", lastSkill: skillName });
  } catch (error) {
    setSkillsCache({ lastResult: { ok: false, error: error.message }, lastRunId: "batch" });
  }
  setSkillsCache({ analyzing: false });
  renderRuns();
}

async function handleLighthouseAnalyze() {
  const ui = getUi();
  if (!ui.selectedRunId) return;
  const providerPicker = document.getElementById("lh-provider-picker");
  const provider = providerPicker?.value || undefined;
  setSkillsCache({ lhAnalyzing: true });
  renderRuns();
  try {
    const result = await api.runSkill("lighthouse-analyst", { runIds: [ui.selectedRunId], provider });
    setSkillsCache({ lhResult: result, lhRunId: ui.selectedRunId });
  } catch (error) {
    setSkillsCache({ lhResult: { ok: false, error: error.message }, lhRunId: ui.selectedRunId });
  }
  setSkillsCache({ lhAnalyzing: false });
  renderRuns();
}

function handleLighthouseToggleView() {
  const cache = getSkillsCache();
  setSkillsCache({ lhView: cache.lhView === "summary" ? "detail" : "summary" });
  renderRuns();
}

export function onClick(event) {
  const ui = getUi();

  const openChatBtn = event.target.closest("[data-action='open-chat']");
  if (openChatBtn) {
    openChatDrawer(openChatBtn.dataset.personaId);
    return;
  }

  const lhAction = event.target.closest("[data-lighthouse-action]");
  if (lhAction) {
    const action = lhAction.dataset.lighthouseAction;
    if (action === "analyze") handleLighthouseAnalyze();
    else if (action === "toggle-view") handleLighthouseToggleView();
    return;
  }

  const skillAction = event.target.closest("[data-skill-action]");
  if (skillAction) {
    const action = skillAction.dataset.skillAction;
    if (action === "analyze") handleSkillAnalyze();
    else if (action === "analyze-batch") handleSkillAnalyzeBatch();
    return;
  }

  const navTab = event.target.closest(".nav-tab");
  if (navTab) {
    if (navTab.classList.contains("is-disabled")) {
      return;
    }
    if (navTab.dataset.section === "projects") {
      ui.selectedProjectId = null;
      ui.filters.personaId = "all";
      ui.filters.taskId = "all";
      ui.filters.status = "all";
    }
    ui.section = navTab.dataset.section;
    render();
    return;
  }

  const projectAction = event.target.closest("[data-project-action]");
  if (projectAction) {
    handleProjectAction(projectAction.dataset.projectAction, projectAction.dataset.id);
    return;
  }

  const personaAction = event.target.closest("[data-persona-action]");
  if (personaAction) {
    handlePersonaAction(personaAction.dataset.personaAction, personaAction.dataset.id);
    return;
  }

  const personaDetailAction = event.target.closest("[data-persona-detail-action]");
  if (personaDetailAction) {
    handlePersonaDetailAction(personaDetailAction.dataset.personaDetailAction, personaDetailAction.dataset.id);
    return;
  }

  const taskAction = event.target.closest("[data-task-action]");
  if (taskAction) {
    handleTaskAction(taskAction.dataset.taskAction, taskAction.dataset.id);
    return;
  }

  const runDeleteAction = event.target.closest("[data-run-action]");
  if (runDeleteAction) {
    handleRunAction(runDeleteAction.dataset.runAction, runDeleteAction.dataset.id);
    return;
  }

  const runAction = event.target.closest("[data-run-id]");
  if (runAction) {
    ui.selectedRunId = runAction.dataset.runId;
    renderRuns();
    return;
  }

  const projectCard = event.target.closest("[data-project-id]");
  if (projectCard) {
    ui.selectedProjectId = projectCard.dataset.projectId;
    ui.filters.personaId = "all";
    ui.filters.taskId = "all";
    ui.filters.status = "all";
    ui.section = "dashboard";
    ensureSelection();
    render();
    return;
  }

  const personaCard = event.target.closest("[data-persona-id]");
  if (personaCard) {
    ui.selectedPersonaId = personaCard.dataset.personaId;
    ui.personaDetailId = personaCard.dataset.personaId;
    ui.section = "persona-detail";
    render();
    return;
  }

  const taskCard = event.target.closest("[data-task-id]");
  if (taskCard) {
    ui.selectedTaskId = taskCard.dataset.taskId;
    renderTasks();
    renderDashboard();
    return;
  }

  const detailView = event.target.closest("[data-detail-view]");
  if (detailView) {
    ui.runDetailView = detailView.dataset.detailView;
    renderRuns();
    return;
  }

  const personaModeBtn = event.target.closest("[data-persona-mode]");
  if (personaModeBtn) {
    setPersonaCreateMode(personaModeBtn.dataset.personaMode);
  }
}

export function onFilterChange(event) {
  const ui = getUi();
  const filter = event.target.name;
  if (!filter) {
    return;
  }
  ui.filters[filter] = event.target.value;
  renderDashboard();
}

export function onKeydown(event) {
  if (!["Enter", " "].includes(event.key)) {
    return;
  }
  if (event.target.closest("button, input, textarea, select, summary")) {
    return;
  }
  const personaCard = event.target.closest("[data-persona-id]");
  if (!personaCard) {
    return;
  }
  event.preventDefault();
  const ui = getUi();
  ui.selectedPersonaId = personaCard.dataset.personaId;
  ui.personaDetailId = personaCard.dataset.personaId;
  ui.section = "persona-detail";
  render();
}
