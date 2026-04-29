import { getState, getUi } from "./store.js";
import {
  escapeHtml,
  formatShortDate,
  statusClass,
  labelDigitalLevel,
  formatTaskLabel,
  emptyStateMarkup,
  getPersonaById,
  getTaskById,
  getRunById,
  severityToClass
} from "./utils.js";
import { fillSelect, toggleFormDisabled, resetProjectForm, resetPersonaForm, resetTaskForm } from "./forms.js";
import { observedDetailHtml, inferredDetailHtml, predictiveDetailHtml, drawRunObserved, drawPredictiveCanvas, skillAnalysisHtml, skillBatchHtml } from "./render-detail.js";

export function renderProjects() {
  const state = getState();
  const ui = getUi();
  const list = document.getElementById("project-list");
  const projects = state.projects || [];
  const projectHtml = projects
    .map((project) => {
      const selected = project.id === ui.selectedProjectId ? " is-selected" : "";
      const personaCount = (state.personas || []).filter((item) => item.project_id === project.id).length;
      const taskCount = (state.tasks || []).filter((item) => item.project_id === project.id).length;
      const runCount = (state.runs || []).filter((item) => item.project_id === project.id).length;
      return `
        <article class="list-card${selected}" data-project-id="${project.id}">
          <header>
            <div>
              <strong>${escapeHtml(project.name)}</strong>
              <p>${escapeHtml(project.description || "Sin descripcion")}</p>
            </div>
            <span class="tag">${formatShortDate(project.created_at)}</span>
          </header>
          <div class="meta-row">
            <span class="pill">${personaCount} personas</span>
            <span class="pill">${taskCount} tasks</span>
            <span class="pill">${runCount} runs</span>
          </div>
          <div class="action-row">
            <button class="ghost-button" data-project-action="select" data-id="${project.id}">
              ${project.id === ui.selectedProjectId ? "Abrir dashboard" : "Seleccionar"}
            </button>
            <button class="ghost-button" data-project-action="edit" data-id="${project.id}">Editar</button>
            <button class="danger-button" data-project-action="delete" data-id="${project.id}">Borrar</button>
          </div>
        </article>
      `;
    })
    .join("");
  list.innerHTML = projectHtml || emptyStateMarkup("Primero crea un proyecto para empezar a usar el laboratorio.");

  if (!ui.editingProjectId) {
    resetProjectForm();
  }
}

export function renderPersonas() {
  const state = getState();
  const ui = getUi();
  const list = document.getElementById("persona-list");
  const projectId = ui.selectedProjectId;
  const personas = projectId ? state.personas.filter((item) => item.project_id === projectId) : [];
  const personasHtml = personas
    .map((persona) => {
      const selected = persona.id === ui.selectedPersonaId ? " is-selected" : "";
      const runCount = state.runs.filter((run) => run.persona_id === persona.id).length;
      return `
        <article class="list-card list-card--interactive${selected}" data-persona-id="${persona.id}" role="button" tabindex="0" aria-label="Abrir ficha de ${escapeHtml(persona.name)}">
          <header>
            <div>
              <strong>${escapeHtml(persona.name)}</strong>
              <p>${escapeHtml(persona.segment)} · ${escapeHtml(persona.role)}</p>
            </div>
            <span class="tag">${persona.status}</span>
          </header>
          <p>${escapeHtml(persona.description || persona.usage_context || "Sin descripcion")}</p>
          <div class="meta-row">
            <span class="pill">v${persona.version}</span>
            <span class="pill">${labelDigitalLevel(persona.digital_level)}</span>
            <span class="pill">${runCount} runs</span>
          </div>
          <div class="action-row">
            <button class="ghost-button" data-persona-action="edit" data-id="${persona.id}">Editar</button>
            <button class="ghost-button" data-persona-action="duplicate" data-id="${persona.id}">Duplicar</button>
            <button class="ghost-button" data-persona-action="archive" data-id="${persona.id}">${persona.status === "archived" ? "Activar" : "Archivar"}</button>
            <button class="danger-button" data-persona-action="delete" data-id="${persona.id}">Borrar</button>
          </div>
        </article>
      `;
    })
    .join("");
  list.innerHTML = projectId
    ? personasHtml || emptyStateMarkup("Todavia no hay personas creadas en este proyecto.")
    : emptyStateMarkup("Primero crea o selecciona un proyecto para usar personas.");

  fillSelect("task-persona-select", personas, ui.selectedPersonaId);
  fillSelect("run-persona", personas, ui.selectedPersonaId, true);
  fillSelect("calibration-persona", personas, ui.selectedPersonaId, true);
  toggleFormDisabled("persona-form", Boolean(projectId));
  if (!ui.editingPersonaId) {
    resetPersonaForm();
  }
}

export function renderTasks() {
  const state = getState();
  const ui = getUi();
  const list = document.getElementById("task-list");
  const projectId = ui.selectedProjectId;
  const tasks = projectId ? state.tasks.filter((item) => item.project_id === projectId) : [];
  const tasksHtml = tasks
    .map((task) => {
      const persona = getPersonaById(task.persona_id, state);
      const selected = task.id === ui.selectedTaskId ? " is-selected" : "";
      return `
        <article class="list-card${selected}" data-task-id="${task.id}">
          <header>
            <div>
              <strong>${escapeHtml(task.prompt.slice(0, 58) || "Task sin prompt")}</strong>
              <p>${task.type} · ${persona ? escapeHtml(persona.name) : "Sin persona"}</p>
            </div>
            <span class="tag">${task.status}</span>
          </header>
          <p>${escapeHtml(task.success_criteria || "Sin criterio de exito")}</p>
          <div class="meta-row">
            <span class="pill">max ${task.max_steps} steps</span>
            ${task.mcp_enabled ? '<span class="pill">MCP on</span>' : ""}
            ${task.predictive_attention_enabled ? '<span class="pill">Predictive on</span>' : ""}
          </div>
          <div class="action-row">
            <button class="ghost-button" data-task-action="edit" data-id="${task.id}">Editar</button>
            <button class="ghost-button" data-task-action="clone-run" data-id="${task.id}">Correr</button>
            <button class="danger-button" data-task-action="delete" data-id="${task.id}">Borrar</button>
          </div>
        </article>
      `;
    })
    .join("");
  list.innerHTML = projectId
    ? tasksHtml || emptyStateMarkup("Todavia no hay tasks creados en este proyecto.")
    : emptyStateMarkup("Primero crea o selecciona un proyecto para usar tasks.");

  fillSelect("run-task", tasks, ui.selectedTaskId, true, formatTaskLabel);
  fillSelect("calibration-task", tasks, ui.selectedTaskId, true, formatTaskLabel);
  toggleFormDisabled("task-form", Boolean(projectId));
  if (!ui.editingTaskId) {
    resetTaskForm();
  }
}

export function renderRuns() {
  const state = getState();
  const ui = getUi();
  const list = document.getElementById("run-list");
  const projectId = ui.selectedProjectId;
  const runs = projectId ? state.runs.filter((item) => item.project_id === projectId) : [];
  const runsHtml = runs
    .map((run) => {
      const persona = getPersonaById(run.persona_id, state);
      const task = getTaskById(run.task_id, state);
      const selected = run.id === ui.selectedRunId ? " is-selected" : "";
      return `
        <article class="list-card${selected}" data-run-id="${run.id}">
          <div class="run-headline">
            <div>
              <strong>${persona ? escapeHtml(persona.name) : "Persona eliminada"}</strong>
              <p>${task ? escapeHtml(task.type) : "task"} · ${task ? escapeHtml(task.prompt.slice(0, 40)) : "sin task"}</p>
            </div>
            <span class="status-pill ${statusClass(run.completion_status)}">${run.completion_status}</span>
          </div>
          <div class="meta-row">
            <span class="pill">seed ${run.seed}</span>
            <span class="pill">${run.persona_version}</span>
            <span class="pill">${formatShortDate(run.started_at)}</span>
            <span class="pill">${escapeHtml(run.engine || "simulated")}</span>
          </div>
          <p>${escapeHtml(run.report_summary)}</p>
          <div class="action-row">
            <button class="danger-button" data-run-action="delete" data-id="${run.id}">Borrar run</button>
          </div>
        </article>
      `;
    })
    .join("");
  list.innerHTML = projectId
    ? runsHtml || emptyStateMarkup("Todavia no hay corridas en este proyecto.")
    : emptyStateMarkup("Primero crea o selecciona un proyecto para ejecutar runs.");
  toggleFormDisabled("run-form", Boolean(projectId));

  const batchPanel = document.getElementById("run-batch-panel");
  if (batchPanel) batchPanel.innerHTML = skillBatchHtml(runs);

  document.querySelectorAll(".pill-button").forEach((button) =>
    button.classList.toggle("is-active", button.dataset.detailView === ui.runDetailView)
  );

  const detail = document.getElementById("run-detail");
  const run = getRunById(ui.selectedRunId, state);
  const title = document.getElementById("run-detail-title");

  if (!run) {
    title.textContent = "Selecciona una corrida";
    detail.innerHTML = emptyStateMarkup("No hay detalle disponible.");
    return;
  }

  const persona = getPersonaById(run.persona_id, state);
  const task = getTaskById(run.task_id, state);
  title.textContent = `${persona ? persona.name : "Persona"} · ${task ? task.type : "run"}`;

  const skillPanel = skillAnalysisHtml(run);

  if (ui.runDetailView === "observed") {
    detail.innerHTML = observedDetailHtml(run) + skillPanel;
    drawRunObserved(run);
    return;
  }

  if (ui.runDetailView === "predictive") {
    detail.innerHTML = predictiveDetailHtml(run, task) + skillPanel;
    drawPredictiveCanvas(run);
    return;
  }

  detail.innerHTML = inferredDetailHtml(run, persona, task) + skillPanel;
}

export function renderCalibration() {
  const state = getState();
  const ui = getUi();
  const list = document.getElementById("calibration-list");
  const projectId = ui.selectedProjectId;
  const calibrations = projectId ? state.calibrations.filter((item) => item.project_id === projectId) : [];
  const calibrationHtml = calibrations
    .map((record) => {
      const persona = getPersonaById(record.persona_id, state);
      const task = getTaskById(record.task_id, state);
      return `
        <article class="list-card">
          <header>
            <div>
              <strong>${persona ? escapeHtml(persona.name) : "Persona eliminada"}</strong>
              <p>${task ? escapeHtml(task.prompt.slice(0, 48)) : "Task eliminado"}</p>
            </div>
            <span class="pill">${record.agreement}% agreement</span>
          </header>
          <p><strong>Humano:</strong> ${escapeHtml(record.human_result)}</p>
          <p><strong>Sintetico:</strong> ${escapeHtml(record.synthetic_result)}</p>
          <p><strong>Criticos:</strong> ${escapeHtml(record.critical_findings)}</p>
          <p>${escapeHtml(record.notes || "")}</p>
        </article>
      `;
    })
    .join("");
  list.innerHTML = projectId
    ? calibrationHtml || emptyStateMarkup("Todavia no hay benchmarks humanos en este proyecto.")
    : emptyStateMarkup("Primero crea o selecciona un proyecto para registrar benchmarks.");
  toggleFormDisabled("calibration-form", Boolean(projectId));
}
