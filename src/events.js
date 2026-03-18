import {
  onProjectSubmit,
  onPersonaSubmit,
  onTaskSubmit,
  onRunSubmit,
  onCalibrationSubmit,
  handleProjectAction,
  handlePersonaAction,
  handleTaskAction,
  handleRunAction
} from "./handlers.js";
import { getUi } from "./store.js";
import { render } from "./render.js";
import { renderRuns, renderPersonas, renderTasks } from "./render-entities.js";
import { renderDashboard } from "./render-dashboard.js";
import { resetProjectForm, resetPersonaForm, resetTaskForm } from "./forms.js";
import { closeConfirmation } from "./confirmation.js";
import { ensureSelection } from "./state-ops.js";
import { exportState, resetDemoData } from "./export.js";

export function bindEvents() {
  document.addEventListener("click", onClick);
  document.getElementById("project-form").addEventListener("submit", onProjectSubmit);
  document.getElementById("persona-form").addEventListener("submit", onPersonaSubmit);
  document.getElementById("task-form").addEventListener("submit", onTaskSubmit);
  document.getElementById("run-form").addEventListener("submit", onRunSubmit);
  document.getElementById("calibration-form").addEventListener("submit", onCalibrationSubmit);
  document.getElementById("project-reset").addEventListener("click", resetProjectForm);
  document.getElementById("persona-reset").addEventListener("click", resetPersonaForm);
  document.getElementById("task-reset").addEventListener("click", resetTaskForm);
  document.getElementById("seed-demo").addEventListener("click", resetDemoData);
  document.getElementById("export-state").addEventListener("click", exportState);
  document.getElementById("dashboard-filters").addEventListener("change", onFilterChange);
  document.getElementById("confirm-modal-cancel").addEventListener("click", () => closeConfirmation(false));
  document.getElementById("confirm-modal-confirm").addEventListener("click", () => closeConfirmation(true));
  document.getElementById("confirm-modal").addEventListener("click", (event) => {
    if (event.target.id === "confirm-modal") {
      closeConfirmation(false);
    }
  });
  window.addEventListener("keydown", (event) => {
    const ui = getUi();
    if (event.key === "Escape" && ui.confirmation) {
      closeConfirmation(false);
    }
  });
}

export function onClick(event) {
  const ui = getUi();

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
    renderPersonas();
    renderDashboard();
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
