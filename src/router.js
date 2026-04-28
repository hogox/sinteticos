import { getState, getUi } from "./store.js";
import { getPersonaById, getProjectById, requiresProject } from "./utils.js";
import { ensureSelection } from "./state-ops.js";

function normalizeSection(section) {
  return ["dashboard", "personas", "tasks", "runs", "calibration", "policy"].includes(section) ? section : "dashboard";
}

export function parseHashRoute(hashValue = "") {
  const hash = String(hashValue || "").trim();
  if (!hash || hash === "#") {
    return { section: "projects" };
  }

  const cleaned = hash.replace(/^#/, "").replace(/^\/+/, "");
  const parts = cleaned.split("/").filter(Boolean).map((part) => decodeURIComponent(part));

  if (!parts.length || parts[0] !== "projects") {
    return { section: "projects" };
  }

  if (parts.length === 1) {
    return { section: "projects" };
  }

  const projectId = parts[1];
  if (!projectId) {
    return { section: "projects" };
  }

  if (parts.length === 2) {
    return { section: "dashboard", projectId };
  }

  if (parts[2] === "personas" && parts[3]) {
    return { section: "persona-detail", projectId, personaId: parts[3] };
  }

  return { section: normalizeSection(parts[2]), projectId };
}

export function buildHashRoute(ui = getUi()) {
  if (ui.section === "projects" || !ui.selectedProjectId) {
    return "#/projects";
  }

  const projectId = encodeURIComponent(ui.selectedProjectId);
  if (ui.section === "persona-detail") {
    const personaId = ui.personaDetailId || ui.selectedPersonaId;
    return personaId ? `#/projects/${projectId}/personas/${encodeURIComponent(personaId)}` : `#/projects/${projectId}/personas`;
  }

  const section = requiresProject(ui.section) || ui.section === "dashboard" || ui.section === "policy" ? ui.section : "dashboard";
  return `#/projects/${projectId}/${section}`;
}

export function applyHashRoute() {
  if (typeof window === "undefined") {
    return;
  }

  const state = getState();
  const ui = getUi();
  const route = parseHashRoute(window.location.hash);

  if (route.section === "projects") {
    ui.section = "projects";
    ui.selectedProjectId = null;
    ui.personaDetailId = null;
    return;
  }

  const project = getProjectById(route.projectId, state);
  if (!project) {
    ui.section = "projects";
    ui.selectedProjectId = null;
    ui.personaDetailId = null;
    return;
  }

  ui.selectedProjectId = project.id;

  if (route.section === "persona-detail") {
    const persona = getPersonaById(route.personaId, state);
    if (persona && persona.project_id === project.id) {
      ui.selectedPersonaId = persona.id;
      ui.personaDetailId = persona.id;
      ui.section = "persona-detail";
      return;
    }
    ui.section = "personas";
    return;
  }

  ui.section = route.section;
}

export function bindHashRouting(render) {
  if (typeof window === "undefined") {
    return;
  }

  window.addEventListener("hashchange", () => {
    applyHashRoute();
    ensureSelection();
    render();
  });
}

export function syncHashWithUi() {
  if (typeof window === "undefined") {
    return;
  }

  const nextHash = buildHashRoute(getUi());
  if (window.location.hash === nextHash) {
    return;
  }

  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
}
