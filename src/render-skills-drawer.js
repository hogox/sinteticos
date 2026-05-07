import { getState, getUi } from "./store.js";
import { escapeHtml, getRunById, getPersonaById, getTaskById, labelTaskType } from "./utils.js";
import { skillAnalysisHtml, skillBatchHtml } from "./render-detail.js";

export function renderSkillsSection() {
  const ui = getUi();
  const section = document.getElementById("skills-section");
  if (!section) return;

  const tabs = section.querySelectorAll(".skills-section__tab");
  const activeTab = ui.skillsDrawer?.tab || "run";
  tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.skillsTab === activeTab);
  });

  const body = document.getElementById("skills-section-body");
  if (!body) return;

  const state = getState();
  const run = getRunById(ui.selectedRunId, state);
  const projectRuns = ui.selectedProjectId
    ? state.runs.filter((r) => r.project_id === ui.selectedProjectId)
    : [];

  if (activeTab === "batch") {
    body.innerHTML = skillBatchHtml(projectRuns) || emptyMarkup("No hay skills batch disponibles.");
    return;
  }

  if (!run) {
    body.innerHTML = emptyMarkup("Selecciona un run para ver el análisis con skills.");
    return;
  }

  body.innerHTML = skillAnalysisHtml(run) || emptyMarkup("No hay skills configurados.");
}

// Backward-compat alias used elsewhere
export const renderSkillsDrawer = renderSkillsSection;

function emptyMarkup(text) {
  return `<div class="empty-state">${escapeHtml(text)}</div>`;
}
