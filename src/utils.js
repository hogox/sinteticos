import { getHostLabel as _getHostLabel } from "../shared/utils.js";

export function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function value(formData, key) {
  return String(formData.get(key) || "").trim();
}

export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatShortDate(dateString) {
  return new Date(dateString).toLocaleDateString("es-CL", { month: "short", day: "numeric" });
}

export function getHostLabel(url) {
  return _getHostLabel(url);
}

export function statusClass(status) {
  if (status === "completed") return "completed";
  if (status === "abandoned") return "abandoned";
  if (status === "error") return "error";
  return "uncertain";
}

export function severityToClass(severity) {
  return severity === "critical" ? "abandoned" : severity === "high" ? "uncertain" : "completed";
}

export function labelDigitalLevel(level) {
  return level === "high" ? "Nivel alto" : level === "low" ? "Nivel bajo" : "Nivel intermedio";
}

export function labelTaskType(type) {
  return type === "idea" ? "Exploración de idea" : "Recorrido guiado";
}

export function formatTaskLabel(task) {
  return `${labelTaskType(task.type)} · ${task.prompt.slice(0, 48)}`;
}

export function metricValue(value) {
  return Number.isFinite(value) ? value : 0;
}

export function emptyStateMarkup(copy) {
  return `<div class="empty-state">${copy}</div>`;
}

export function getPersonaById(id, state) {
  return state.personas.find((item) => item.id === id) || null;
}

export function getProjectById(id, state) {
  return (state.projects || []).find((item) => item.id === id) || null;
}

export function getTaskById(id, state) {
  return state.tasks.find((item) => item.id === id) || null;
}

export function getRunById(id, state) {
  return state.runs.find((item) => item.id === id) || null;
}

export function requiresProject(section) {
  // Personas son top-level: ya no requieren proyecto seleccionado.
  return ["tasks", "runs", "calibration"].includes(section);
}

export function mostActiveProjectLabel(state) {
  const projects = state.projects || [];
  if (!projects.length) {
    return "N/A";
  }
  const ranked = projects
    .map((project) => ({
      name: project.name,
      runs: (state.runs || []).filter((item) => item.project_id === project.id).length
    }))
    .sort((a, b) => b.runs - a.runs);
  return ranked[0].name;
}
