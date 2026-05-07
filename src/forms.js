import { getUi } from "./store.js";
import { escapeHtml } from "./utils.js";

export function fillProjectForm(project) {
  const form = document.getElementById("project-form");
  Object.keys(project).forEach((key) => {
    if (form.elements.namedItem(key)) {
      form.elements.namedItem(key).value = project[key];
    }
  });
  const ctx = project.context || {};
  if (form.elements.namedItem("domain_brief")) form.elements.namedItem("domain_brief").value = ctx.domain_brief || "";
  if (form.elements.namedItem("audience_constraints")) form.elements.namedItem("audience_constraints").value = ctx.audience_constraints || "";
  if (form.elements.namedItem("prior_findings")) form.elements.namedItem("prior_findings").value = (ctx.prior_findings || []).join("\n");
  if (form.elements.namedItem("do_not")) form.elements.namedItem("do_not").value = (ctx.do_not || []).join("\n");
  document.getElementById("project-form-title").textContent = `Editar ${project.name}`;
}

export function fillPersonaForm(persona) {
  const form = document.getElementById("persona-form");
  Object.keys(persona).forEach((key) => {
    if (form.elements.namedItem(key)) {
      form.elements.namedItem(key).value = persona[key];
    }
  });
  document.getElementById("persona-form-title").textContent = `Editar ${persona.name}`;
}

export function fillTaskForm(task) {
  const form = document.getElementById("task-form");
  Object.keys(task).forEach((key) => {
    const field = form.elements.namedItem(key);
    if (!field) {
      return;
    }
    if (field.type === "checkbox") {
      field.checked = Boolean(task[key]);
    } else {
      field.value = task[key];
    }
  });
  const unlimited = form.elements.namedItem("unlimited_steps");
  const maxStepsField = document.getElementById("max-steps-field");
  if (unlimited) {
    unlimited.checked = task.max_steps == null;
    if (maxStepsField) maxStepsField.style.display = unlimited.checked ? "none" : "";
  }
  document.getElementById("task-form-title").textContent = "Editar tarea";
}

export function resetProjectForm() {
  const ui = getUi();
  ui.editingProjectId = null;
  const form = document.getElementById("project-form");
  form.reset();
  document.getElementById("project-form-title").textContent = "Crear proyecto";
}

export function resetPersonaForm() {
  const ui = getUi();
  ui.editingPersonaId = null;
  const form = document.getElementById("persona-form");
  form.reset();
  document.getElementById("persona-form-title").textContent = "Crear persona";
}

export function resetTaskForm() {
  const ui = getUi();
  ui.editingTaskId = null;
  const form = document.getElementById("task-form");
  form.reset();
  form.elements.namedItem("artifacts_enabled").checked = true;
  form.elements.namedItem("type").value = "navigation";
  const maxStepsField = document.getElementById("max-steps-field");
  if (maxStepsField) maxStepsField.style.display = "";
  document.getElementById("task-form-title").textContent = "Crear tarea";
}

export function fillSelect(id, items, selectedId, keepPlaceholder, formatter) {
  const select = document.getElementById(id);
  if (!select) {
    return;
  }
  const options = [];
  if (keepPlaceholder) {
    options.push(`<option value="">Selecciona</option>`);
  }
  items.forEach((item) => {
    const valueId = item.id;
    const label = formatter ? formatter(item) : item.name;
    options.push(`<option value="${valueId}" ${valueId === selectedId ? "selected" : ""}>${escapeHtml(label)}</option>`);
  });
  select.innerHTML = options.join("");
  if (selectedId && select.querySelector(`option[value="${selectedId}"]`)) {
    select.value = selectedId;
  }
}

export function toggleFormDisabled(id, enabled) {
  const form = document.getElementById(id);
  if (!form) {
    return;
  }
  Array.from(form.elements).forEach((field) => {
    if (field.tagName === "FIELDSET") {
      return;
    }
    field.disabled = !enabled;
  });
}
