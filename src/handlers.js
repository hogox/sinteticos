import { api } from "./api.js";
import { getState, setState, getUi } from "./store.js";
import { value, getProjectById, getPersonaById, getTaskById } from "./utils.js";
import { fillProjectForm, fillPersonaForm, fillTaskForm } from "./forms.js";
import { confirmAction, alertError } from "./confirmation.js";
import { render } from "./render.js";
import { renderRuns, renderPersonas, renderTasks } from "./render-entities.js";
import { renderDashboard } from "./render-dashboard.js";
import { ensureSelection } from "./state-ops.js";

export async function onProjectSubmit(event) {
  event.preventDefault();
  const ui = getUi();
  const formData = new FormData(event.currentTarget);
  const payload = {
    name: value(formData, "name"),
    description: value(formData, "description")
  };

  if (ui.editingProjectId) {
    const confirmed = await confirmAction({
      title: "Actualizar proyecto",
      body: `Se guardaran los cambios de ${payload.name || "este proyecto"}. Puedes cancelar si todavia quieres ajustar el contexto antes de confirmar.`,
      confirmLabel: "Actualizar"
    });
    if (!confirmed) {
      return;
    }
    setState(await api.updateProject(ui.editingProjectId, payload));
  } else {
    setState(await api.createProject(payload));
    const state = getState();
    ui.selectedProjectId = state.projects && state.projects[0] ? state.projects[0].id : null;
    ui.section = "dashboard";
  }

  ui.editingProjectId = null;
  const { closeProjectModal } = await import("./project-modal.js");
  closeProjectModal();
  ensureSelection();
  render();
  event.currentTarget.reset();
}

export async function onPersonaSubmit(event) {
  event.preventDefault();
  const ui = getUi();
  if (!ui.selectedProjectId) {
    return;
  }
  const formData = new FormData(event.currentTarget);
  const payload = {
    project_id: ui.selectedProjectId,
    name: value(formData, "name"),
    description: value(formData, "description"),
    role: value(formData, "role"),
    segment: value(formData, "segment"),
    functional_context: value(formData, "functional_context"),
    usage_context: value(formData, "usage_context"),
    goals: value(formData, "goals"),
    motivations: value(formData, "motivations"),
    needs: value(formData, "needs"),
    behaviors: value(formData, "behaviors"),
    pains: value(formData, "pains"),
    frictions: value(formData, "frictions"),
    personality_traits: value(formData, "personality_traits"),
    digital_environment: value(formData, "digital_environment"),
    digital_behavior: value(formData, "digital_behavior"),
    devices: value(formData, "devices"),
    digital_level: value(formData, "digital_level"),
    apps_used: value(formData, "apps_used"),
    restrictions: value(formData, "restrictions"),
    attachments: value(formData, "attachments")
  };

  if (ui.editingPersonaId) {
    const confirmed = await confirmAction({
      title: "Actualizar usuario sintetico",
      body: `Se guardaran los cambios de ${payload.name || "este usuario"} y se creara una nueva version del perfil. Puedes cancelar si quieres seguir revisando antes de confirmar.`,
      confirmLabel: "Actualizar"
    });
    if (!confirmed) {
      return;
    }
    setState(await api.updatePersona(ui.editingPersonaId, payload));
  } else {
    setState(await api.createPersona(payload));
  }

  ui.editingPersonaId = null;
  const { closePersonaModal } = await import("./persona-modal.js");
  closePersonaModal();
  ensureSelection();
  render();
  event.currentTarget.reset();
}

export async function onTaskSubmit(event) {
  event.preventDefault();
  const ui = getUi();
  if (!ui.selectedProjectId) {
    return;
  }
  const formData = new FormData(event.currentTarget);
  const payload = {
    project_id: ui.selectedProjectId,
    persona_id: value(formData, "persona_id"),
    type: value(formData, "type"),
    prompt: value(formData, "prompt"),
    url: value(formData, "url"),
    success_criteria: value(formData, "success_criteria"),
    max_steps: Number(value(formData, "max_steps")) || 5,
    mcp_enabled: Boolean(formData.get("mcp_enabled")),
    predictive_attention_enabled: Boolean(formData.get("predictive_attention_enabled")),
    artifacts_enabled: Boolean(formData.get("artifacts_enabled"))
  };

  if (ui.editingTaskId) {
    const confirmed = await confirmAction({
      title: "Actualizar task",
      body: `Se guardaran los cambios de ${payload.prompt || "esta task"}. Puedes cancelar y seguir ajustando el objetivo antes de confirmar.`,
      confirmLabel: "Actualizar"
    });
    if (!confirmed) {
      return;
    }
    setState(await api.updateTask(ui.editingTaskId, payload));
  } else {
    setState(await api.createTask(payload));
  }
  ui.editingTaskId = null;
  ensureSelection();
  render();
  event.currentTarget.reset();
}

function validateTaskForRun(task, persona) {
  const issues = [];
  if (!task) {
    issues.push("No se encontró la task seleccionada.");
    return issues;
  }
  if (!persona) {
    issues.push("La task no tiene una persona asignada.");
  }
  if (!task.prompt || task.prompt.trim() === "") {
    issues.push("El campo Prompt / Objetivo está vacío.");
  }
  const url = (task.url || "").trim();
  if (!url) {
    issues.push("La URL del prototipo Figma está vacía.");
  } else if (url.startsWith("REEMPLAZAR") || url.toLowerCase().includes("placeholder")) {
    issues.push(`La URL sigue siendo un placeholder: "${url}". Editá la task y pegá el link real de Figma.`);
  } else if (!url.startsWith("http")) {
    issues.push(`La URL no parece válida: "${url}".`);
  }
  return issues;
}

export async function onRunSubmit(event) {
  event.preventDefault();
  const ui = getUi();
  if (!ui.selectedProjectId) {
    return;
  }
  const formData = new FormData(event.currentTarget);
  const taskId = value(formData, "taskId");
  const personaId = value(formData, "personaId");
  const state = getState();
  const task = getTaskById(taskId, state);
  const persona = getPersonaById(personaId, state) || getPersonaById(task?.persona_id, state);
  const issues = validateTaskForRun(task, persona);
  if (issues.length > 0) {
    alertError({
      title: "No se puede lanzar el run",
      body: "Revisá los siguientes problemas antes de continuar:",
      issues
    });
    return;
  }
  const runCount = Math.max(1, Math.min(8, Number(value(formData, "runCount")) || 1));
  setState(await api.createRuns(taskId, personaId, runCount));
  ensureSelection();
  ui.section = "runs";
  render();
}

export async function onCalibrationSubmit(event) {
  event.preventDefault();
  const ui = getUi();
  if (!ui.selectedProjectId) {
    return;
  }
  const formData = new FormData(event.currentTarget);
  const payload = {
    project_id: ui.selectedProjectId,
    persona_id: value(formData, "persona_id"),
    task_id: value(formData, "task_id"),
    prototype_version: value(formData, "prototype_version"),
    human_result: value(formData, "human_result"),
    synthetic_result: value(formData, "synthetic_result"),
    critical_findings: value(formData, "critical_findings"),
    agreement: Number(value(formData, "agreement")) || 0,
    notes: value(formData, "notes")
  };

  setState(await api.createCalibration(payload));
  render();
  event.currentTarget.reset();
}

export async function onPersonaChatSubmit(event) {
  event.preventDefault();
  const ui = getUi();
  const state = getState();
  const persona = getPersonaById(ui.personaDetailId, state);
  if (!persona || ui.personaChatBusy) {
    return;
  }

  const formData = new FormData(event.target);
  const content = value(formData, "content");
  if (!content) {
    return;
  }

  const mode = value(formData, "mode") || ui.personaChatMode || "free";
  const anchorRunId = value(formData, "anchorRunId");
  ui.personaChatMode = mode;
  ui.personaChatAnchorRunId = anchorRunId;
  ui.personaChatBusy = true;
  render();

  try {
    let threadId = ui.selectedConversationId;
    const existingThread = (getState().persona_conversations || []).find((item) => item.id === threadId && item.persona_id === persona.id);
    if (!existingThread) {
      setState(await api.createPersonaConversation(persona.id, { mode, anchorRunId }));
      const nextThread = (getState().persona_conversations || []).find((item) => item.persona_id === persona.id);
      threadId = nextThread ? nextThread.id : null;
      ui.selectedConversationId = threadId;
    }
    if (!threadId) {
      return;
    }
    setState(await api.sendPersonaMessage(persona.id, threadId, { content, mode, anchorRunId }));
  } catch (error) {
    alertError({
      title: "No se pudo enviar el mensaje",
      body: error.message || "El chat no pudo guardar o responder el mensaje."
    });
  } finally {
    ui.personaChatBusy = false;
    ensureSelection();
    render();
  }
}

export async function handleProjectAction(action, id) {
  const state = getState();
  const ui = getUi();
  const project = getProjectById(id, state);
  if (!project) {
    return;
  }

  if (action === "select") {
    ui.selectedProjectId = id;
    ui.filters.personaId = "all";
    ui.filters.taskId = "all";
    ui.filters.status = "all";
    ui.section = "dashboard";
    ensureSelection();
    render();
    return;
  }

  if (action === "edit") {
    ui.editingProjectId = id;
    const { openProjectModal } = await import("./project-modal.js");
    fillProjectForm(project);
    openProjectModal();
    return;
  }

  if (action === "delete") {
    const confirmed = await confirmAction({
      title: "Eliminar proyecto",
      body: `Se eliminara ${project.name} junto con sus personas, tasks, runs y benchmarks asociados. Puedes cancelar si quieres conservar ese trabajo.`,
      confirmLabel: "Eliminar"
    });
    if (!confirmed) {
      return;
    }
    setState(await api.deleteProject(id));
    if (ui.selectedProjectId === id) {
      ui.selectedProjectId = null;
      ui.section = "projects";
    }
    ensureSelection();
    render();
  }
}

export async function handlePersonaAction(action, id) {
  const state = getState();
  const ui = getUi();
  const persona = getPersonaById(id, state);
  if (!persona) {
    return;
  }

  if (action === "edit") {
    ui.editingPersonaId = id;
    ui.personaCreateMode = "advanced";
    const { setPersonaCreateMode } = await import("./persona-modes.js");
    const { openPersonaModal } = await import("./persona-modal.js");
    setPersonaCreateMode("advanced");
    fillPersonaForm(persona);
    openPersonaModal();
    return;
  }

  if (action === "duplicate") {
    setState(await api.duplicatePersona(id));
    ensureSelection();
    render();
    return;
  }

  if (action === "archive") {
    setState(await api.archivePersona(id));
    render();
    return;
  }

  if (action === "delete") {
    const confirmed = await confirmAction({
      title: "Eliminar usuario sintetico",
      body: `Se eliminara ${persona.name}. Las corridas historicas se mantendran, pero el arquetipo dejara de estar disponible para nuevas tareas.`,
      confirmLabel: "Eliminar"
    });
    if (!confirmed) {
      return;
    }
    setState(await api.deletePersona(id));
    if (ui.personaDetailId === id) {
      ui.personaDetailId = null;
      if (ui.section === "persona-detail") {
        ui.section = "personas";
      }
    }
    ensureSelection();
    render();
  }
}

export async function handlePersonaDetailAction(action, id) {
  const state = getState();
  const ui = getUi();

  if (action === "back") {
    ui.section = "personas";
    render();
    return;
  }

  if (action === "select-chat") {
    ui.selectedConversationId = id;
    render();
    return;
  }

  const personaId = action === "edit" ? id || ui.personaDetailId : ui.personaDetailId;
  const persona = getPersonaById(personaId, state);

  if (!persona) {
    return;
  }

  if (action === "edit") {
    ui.section = "personas";
    ui.editingPersonaId = persona.id;
    ui.personaCreateMode = "advanced";
    const { setPersonaCreateMode } = await import("./persona-modes.js");
    setPersonaCreateMode("advanced");
    fillPersonaForm(persona);
    render();
    return;
  }

  if (action === "new-chat") {
    setState(await api.createPersonaConversation(persona.id, { mode: ui.personaChatMode, anchorRunId: ui.personaChatAnchorRunId }));
    const thread = (getState().persona_conversations || []).find((item) => item.persona_id === persona.id);
    ui.selectedConversationId = thread ? thread.id : null;
    render();
    return;
  }

}

export async function handleTaskAction(action, id) {
  const state = getState();
  const ui = getUi();
  const task = getTaskById(id, state);
  if (!task) {
    return;
  }

  if (action === "edit") {
    ui.editingTaskId = id;
    fillTaskForm(task);
    return;
  }

  if (action === "delete") {
    const confirmed = await confirmAction({
      title: "Eliminar task",
      body: "Se eliminara esta task del laboratorio. Puedes cancelar si todavia quieres conservarla para futuras corridas.",
      confirmLabel: "Eliminar"
    });
    if (!confirmed) {
      return;
    }
    setState(await api.deleteTask(id));
    ensureSelection();
    render();
    return;
  }

  if (action === "clone-run") {
    const persona = getPersonaById(task.persona_id, state);
    const issues = validateTaskForRun(task, persona);
    if (issues.length > 0) {
      alertError({
        title: "No se puede lanzar el run",
        body: "Revisá los siguientes problemas antes de continuar:",
        issues
      });
      return;
    }
    setState(await api.createRuns(id, task.persona_id, 1));
    ensureSelection();
    ui.section = "runs";
    render();
  }
}

export async function handleRunAction(action, id) {
  const ui = getUi();
  if (action !== "delete") {
    return;
  }

  const confirmed = await confirmAction({
    title: "Eliminar run",
    body: `Se eliminara ${id} del historial del laboratorio. Esta accion no se puede deshacer desde la interfaz.`,
    confirmLabel: "Eliminar"
  });
  if (!confirmed) {
    return;
  }
  setState(await api.deleteRun(id));
  ensureSelection();
  render();
}
