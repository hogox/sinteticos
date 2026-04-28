import { getState, getUi, getRuntime } from "./store.js";
import { POLICY, getSectionTitle, getSections, getNavTabs, getTopbarActions } from "./constants.js";
import { requiresProject, getProjectById, getPersonaById } from "./utils.js";
import { renderProjects, renderPersonas, renderTasks, renderRuns, renderCalibration } from "./render-entities.js";
import { renderDashboard } from "./render-dashboard.js";
import { renderPersonaDetail } from "./render-persona-detail.js";
import { syncHashWithUi } from "./router.js";

export function render() {
  renderSection();
  renderRuntimeBadge();
  renderPolicy();
  renderProjects();
  renderPersonas();
  renderPersonaDetail();
  renderTasks();
  renderRuns();
  renderCalibration();
  renderDashboard();
  syncHashWithUi();
}

export function renderSection() {
  const ui = getUi();
  const sectionTitle = getSectionTitle();
  const sections = getSections();
  const navTabs = getNavTabs();
  if (!ui.selectedProjectId && requiresProject(ui.section)) {
    ui.section = "projects";
  }
  if (!ui.selectedProjectId && ui.section === "dashboard") {
    ui.section = "projects";
  }
  if (ui.section === "persona-detail" && !getPersonaById(ui.personaDetailId, getState())) {
    ui.section = "personas";
  }
  navTabs.forEach((tab) => {
    const shouldHide = tab.dataset.section !== "projects" && !ui.selectedProjectId;
    tab.classList.toggle("hidden", shouldHide);
  });
  navTabs.forEach((tab) =>
    tab.classList.toggle("is-active", tab.dataset.section === ui.section || (ui.section === "persona-detail" && tab.dataset.section === "personas"))
  );
  navTabs.forEach((tab) => tab.classList.toggle("is-disabled", !ui.selectedProjectId && requiresProject(tab.dataset.section)));
  sections.forEach((section) => section.classList.toggle("is-active", section.id === `section-${ui.section}`));
  if (ui.section === "projects") {
    sectionTitle.textContent = "Projects";
    return;
  }
  if (ui.section === "persona-detail") {
    const persona = getPersonaById(ui.personaDetailId, getState());
    sectionTitle.textContent = persona ? persona.name : "Persona";
    return;
  }
  sectionTitle.textContent = ui.section.charAt(0).toUpperCase() + ui.section.slice(1);
}

export function renderRuntimeBadge() {
  const state = getState();
  const ui = getUi();
  const runtime = getRuntime();
  const badge = document.getElementById("runtime-badge");
  if (!badge) {
    return;
  }
  const engine = runtime.backend ? `backend · ${runtime.runner}` : "browser fallback";
  const project = getProjectById(ui.selectedProjectId, state);
  const mcpLabel = runtime.figma_mcp ? "Figma MCP ready" : `MCP ${runtime.mcp}`;
  badge.textContent = project ? `${project.name} · ${engine} · ${mcpLabel}` : `${engine} · ${mcpLabel}`;
}

export function createRuntimeBadge() {
  const topbarActions = getTopbarActions();
  const badge = document.createElement("div");
  badge.id = "runtime-badge";
  badge.className = "pill";
  topbarActions.prepend(badge);
}

export function renderPolicy() {
  document.getElementById("policy-mandatory").innerHTML = POLICY.mandatory.map((item) => `<li>${item}</li>`).join("");
  document.getElementById("policy-guardrails").innerHTML = POLICY.guardrails.map((item) => `<li>${item}</li>`).join("");
}
