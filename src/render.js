import { getState, getUi, getRuntime } from "./store.js";
import { POLICY, getSectionTitle, getSections, getNavTabs, getTopbarActions } from "./constants.js";
import { requiresProject, getProjectById, getPersonaById } from "./utils.js";
import { renderProjects, renderPersonas, renderTasks, renderRuns, renderCalibration } from "./render-entities.js";
import { renderDashboard } from "./render-dashboard.js";
import { renderPersonaDetail } from "./render-persona-detail.js";
import { renderChatDrawer } from "./render-chat-drawer.js";
import { renderHome } from "./render-home.js";
import { syncHashWithUi } from "./router.js";

export function render() {
  renderSection();
  renderRuntimeBadge();
  renderPolicy();
  renderHome();
  renderProjects();
  renderPersonas();
  renderPersonaDetail();
  renderTasks();
  renderRuns();
  renderCalibration();
  renderDashboard();
  renderChatDrawer();
  syncHashWithUi();
}

export function renderSection() {
  const ui = getUi();
  const sectionTitle = getSectionTitle();
  const sections = getSections();
  const navTabs = getNavTabs();
  if (!ui.selectedProjectId && requiresProject(ui.section)) {
    ui.section = "home";
  }
  if (!ui.selectedProjectId && ui.section === "dashboard") {
    ui.section = "projects";
  }
  if (ui.section === "persona-detail" && !getPersonaById(ui.personaDetailId, getState())) {
    ui.section = "personas";
  }
  // Visibilidad: tabs siempre visibles (personas, projects, policy).
  // Child tabs (Dashboard, Tareas, Runs, Calibration) solo cuando hay proyecto seleccionado.
  navTabs.forEach((tab) => {
    const section = tab.dataset.section;
    const alwaysVisible = ["personas", "projects", "policy"].includes(section);
    const shouldHide = !alwaysVisible && !ui.selectedProjectId;
    tab.classList.toggle("hidden", shouldHide);
  });

  // Active state.
  const projectScopedSections = new Set(["dashboard", "tasks", "runs", "calibration"]);
  navTabs.forEach((tab) => {
    const section = tab.dataset.section;
    const isActive =
      section === ui.section ||
      (ui.section === "persona-detail" && section === "personas");
    tab.classList.toggle("is-active", isActive);
    // Projects tab: is-parent-active cuando estamos en una subsección del proyecto.
    if (section === "projects") {
      const inProjectScope = projectScopedSections.has(ui.section) && !!ui.selectedProjectId;
      tab.classList.toggle("is-parent-active", inProjectScope);
    }
  });

  navTabs.forEach((tab) => tab.classList.toggle("is-disabled", !ui.selectedProjectId && requiresProject(tab.dataset.section)));
  sections.forEach((section) => section.classList.toggle("is-active", section.id === `section-${ui.section}`));

  // Projects tab label: muestra el proyecto activo cuando hay uno seleccionado.
  const projectsTab = document.getElementById("nav-projects-tab");
  if (projectsTab) {
    const project = getProjectById(ui.selectedProjectId, getState());
    const label = project ? project.name : "Projects";
    const lastNode = projectsTab.childNodes[projectsTab.childNodes.length - 1];
    if (lastNode) lastNode.textContent = label;
    projectsTab.dataset.icon = project ? label.slice(0, 2).toUpperCase() : "PR";
  }

  // Dashboard tab keeps generic label.
  const dashTab = document.getElementById("nav-dashboard-tab");
  if (dashTab) {
    const lastNode = dashTab.childNodes[dashTab.childNodes.length - 1];
    if (lastNode) lastNode.textContent = "Dashboard";
    dashTab.dataset.icon = "DA";
  }

  // Topbar breadcrumb
  const breadcrumb = document.getElementById("topbar-breadcrumb");
  if (breadcrumb) {
    const state = getState();
    const project = getProjectById(ui.selectedProjectId, state);
    breadcrumb.textContent = project ? `Workspace › ${project.name}` : "Workspace";
  }

  // Topbar date
  const dateEl = document.getElementById("topbar-date");
  if (dateEl && !dateEl.dataset.set) {
    dateEl.textContent = new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    dateEl.dataset.set = "1";
  }

  if (ui.section === "home") {
    sectionTitle.textContent = "Inicio";
    return;
  }
  if (ui.section === "projects") {
    sectionTitle.textContent = "Projects";
    return;
  }
  if (ui.section === "personas") {
    sectionTitle.textContent = "Personas";
    return;
  }
  if (ui.section === "tasks") {
    sectionTitle.textContent = "Tareas";
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

  // Legacy topbar pill (kept for compatibility)
  const badge = document.getElementById("runtime-badge");
  if (badge) {
    const engine = runtime.backend ? `backend · ${runtime.runner}` : "browser fallback";
    const project = getProjectById(ui.selectedProjectId, state);
    const mcpLabel = runtime.figma_mcp ? "Figma MCP ready" : `MCP ${runtime.mcp}`;
    badge.textContent = project ? `${project.name} · ${engine} · ${mcpLabel}` : `${engine} · ${mcpLabel}`;
  }

  // New sidebar runtime indicator
  const dot = document.getElementById("runtime-dot");
  const label = document.getElementById("runtime-label");
  if (dot && label) {
    const online = runtime.backend;
    dot.classList.toggle("is-online", online);
    const engine = online ? runtime.runner || "backend" : "browser fallback";
    label.textContent = online ? `Online · ${engine}` : "Offline · simulado";
  }
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
