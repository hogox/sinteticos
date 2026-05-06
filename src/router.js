import { getState, getUi } from "./store.js";
import { getPersonaById, getProjectById } from "./utils.js";
import { ensureSelection } from "./state-ops.js";

const PROJECT_SUBSECTIONS = new Set(["dashboard", "tasks", "runs", "calibration", "policy"]);

export function parseHashRoute(hashValue = "") {
  const hash = String(hashValue || "").trim();
  if (!hash || hash === "#" || hash === "#/" || hash === "#/home" || hash === "#/dashboard") {
    return { section: "home" };
  }

  const cleaned = hash.replace(/^#/, "").replace(/^\/+/, "");
  const parts = cleaned.split("/").filter(Boolean).map((part) => decodeURIComponent(part));

  if (!parts.length) {
    return { section: "home" };
  }

  if (parts[0] === "personas") {
    if (parts[1]) {
      return { section: "persona-detail", personaId: parts[1] };
    }
    return { section: "personas" };
  }

  if (parts[0] === "projects") {
    if (!parts[1]) {
      return { section: "projects" };
    }
    const projectId = parts[1];
    if (!parts[2] || parts[2] === "dashboard") {
      return { section: "dashboard", projectId };
    }
    if (PROJECT_SUBSECTIONS.has(parts[2])) {
      return { section: parts[2], projectId };
    }
    return { section: "dashboard", projectId };
  }

  return { section: "home" };
}

export function buildHashRoute(ui = getUi()) {
  if (ui.section === "home") {
    return "#/";
  }
  if (ui.section === "personas") {
    return "#/personas";
  }
  if (ui.section === "persona-detail") {
    const personaId = ui.personaDetailId || ui.selectedPersonaId;
    return personaId ? `#/personas/${encodeURIComponent(personaId)}` : "#/personas";
  }
  if (ui.section === "projects") {
    return "#/projects";
  }
  if (!ui.selectedProjectId) {
    return "#/projects";
  }
  const projectId = encodeURIComponent(ui.selectedProjectId);
  if (ui.section === "dashboard" || ui.section === "policy") {
    return `#/projects/${projectId}/${ui.section}`;
  }
  if (PROJECT_SUBSECTIONS.has(ui.section)) {
    return `#/projects/${projectId}/${ui.section}`;
  }
  return `#/projects/${projectId}`;
}

export function applyHashRoute() {
  if (typeof window === "undefined") {
    return;
  }

  const state = getState();
  const ui = getUi();
  const route = parseHashRoute(window.location.hash);

  if (route.section === "home") {
    ui.section = "home";
    ui.selectedProjectId = null;
    ui.personaDetailId = null;
    return;
  }

  if (route.section === "personas") {
    ui.section = "personas";
    ui.personaDetailId = null;
    return;
  }

  if (route.section === "persona-detail") {
    const persona = getPersonaById(route.personaId, state);
    if (persona) {
      ui.personaDetailId = persona.id;
      ui.selectedPersonaId = persona.id;
      ui.section = "persona-detail";
      return;
    }
    ui.section = "personas";
    ui.personaDetailId = null;
    return;
  }

  if (route.section === "projects") {
    ui.section = "projects";
    ui.selectedProjectId = null;
    return;
  }

  // project-scoped sections
  const project = getProjectById(route.projectId, state);
  if (!project) {
    ui.section = "projects";
    ui.selectedProjectId = null;
    return;
  }
  ui.selectedProjectId = project.id;
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
