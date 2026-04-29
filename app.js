(function () {
  const STORAGE_KEY = "sinteticos-lab-state-v2";
  const sectionTitle = document.getElementById("section-title");
  const sections = document.querySelectorAll(".section");
  const navTabs = document.querySelectorAll(".nav-tab");
  const topbarActions = document.querySelector(".topbar-actions");

  const POLICY = {
    mandatory: [
      "Responder siempre en primera persona.",
      "Hablar como usuario y no como analista, PM, diseniador o consultor.",
      "Priorizar experiencia real, limites, contexto y comportamiento observable.",
      "No proponer soluciones de diseno o negocio como salida primaria.",
      "Mantener coherencia con rol, segmento, entorno digital, dispositivos y nivel digital.",
      "Terminar cada respuesta con 1 a 3 preguntas de seguimiento."
    ],
    guardrails: [
      "No inventar hechos cuando falte informacion del perfil.",
      "Expresar duda o falta de certeza si el contexto es insuficiente.",
      "Usar exclusion explicita fuera del dominio del usuario.",
      "No mezclar voz del usuario con la sintesis analitica del dashboard.",
      "No presentar outputs predictivos como evidencia observada.",
      "No llamar eye tracking real a heatmaps o scanpaths simulados."
    ]
  };

  const api = createApi();
  let state = emptyState();
  let runtime = { mode: "loading", runner: "unknown", backend: false, mcp: "optional", skills: null };
  let skillsCache = { list: [], loaded: false, analyzing: false, lastResult: null, lastRunId: null, lastSkill: null };
  let ui = {
    section: "projects",
    selectedProjectId: null,
    selectedPersonaId: null,
    selectedTaskId: null,
    selectedRunId: null,
    editingProjectId: null,
    editingPersonaId: null,
    editingTaskId: null,
    confirmation: null,
    runDetailView: "observed",
    filters: {
      personaId: "all",
      taskId: "all",
      status: "all"
    }
  };

  bootstrap();

  async function bootstrap() {
    runtime = await api.health();
    state = await api.loadState();
    if (runtime.backend && runtime.skills && runtime.skills.providers_available.length) {
      try {
        const data = await request("/api/skills");
        skillsCache.list = data.skills || [];
        skillsCache.loaded = true;
        console.log("[skills] loaded", skillsCache.list.length, "skills");
      } catch (err) { console.warn("[skills] load failed", err); }
    } else {
      console.log("[skills] skipped", { backend: runtime.backend, skills: runtime.skills });
    }
    ensureSelection();
    createRuntimeBadge();
    bindEvents();
    render();
  }

  function bindEvents() {
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
      if (event.key === "Escape" && ui.confirmation) {
        closeConfirmation(false);
      }
    });
  }

  function createRuntimeBadge() {
    const badge = document.createElement("div");
    badge.id = "runtime-badge";
    badge.className = "pill";
    topbarActions.prepend(badge);
  }

  function onClick(event) {
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
      render();
      return;
    }

    const taskCard = event.target.closest("[data-task-id]");
    if (taskCard) {
      ui.selectedTaskId = taskCard.dataset.taskId;
      render();
      return;
    }

    const skillAction = event.target.closest("[data-skill-action]");
    if (skillAction) {
      const action = skillAction.dataset.skillAction;
      if (action === "analyze") {
        handleSkillAnalyze();
      } else if (action === "analyze-batch") {
        handleSkillAnalyzeBatch();
      } else if (action === "toggle-raw") {
        const raw = document.getElementById("skill-raw-output");
        if (raw) raw.classList.toggle("hidden");
      }
      return;
    }

    const detailView = event.target.closest("[data-detail-view]");
    if (detailView) {
      ui.runDetailView = detailView.dataset.detailView;
      renderRuns();
    }
  }

  function onFilterChange(event) {
    const filter = event.target.name;
    if (!filter) {
      return;
    }
    ui.filters[filter] = event.target.value;
    renderDashboard();
  }

  async function onProjectSubmit(event) {
    event.preventDefault();
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
      state = await api.updateProject(ui.editingProjectId, payload);
    } else {
      state = await api.createProject(payload);
      ui.selectedProjectId = state.projects && state.projects[0] ? state.projects[0].id : null;
      ui.section = "dashboard";
    }

    ui.editingProjectId = null;
    ensureSelection();
    render();
    event.currentTarget.reset();
  }

  async function onPersonaSubmit(event) {
    event.preventDefault();
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
      state = await api.updatePersona(ui.editingPersonaId, payload);
    } else {
      state = await api.createPersona(payload);
    }

    ui.editingPersonaId = null;
    ensureSelection();
    render();
    event.currentTarget.reset();
  }

  async function onTaskSubmit(event) {
    event.preventDefault();
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
      state = await api.updateTask(ui.editingTaskId, payload);
    } else {
      state = await api.createTask(payload);
    }
    ui.editingTaskId = null;
    ensureSelection();
    render();
    event.currentTarget.reset();
  }

  async function onRunSubmit(event) {
    event.preventDefault();
    if (!ui.selectedProjectId) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const taskId = value(formData, "taskId");
    const personaId = value(formData, "personaId");
    const runCount = Math.max(1, Math.min(8, Number(value(formData, "runCount")) || 1));
    state = await api.createRuns(taskId, personaId, runCount);
    ensureSelection();
    ui.section = "runs";
    render();
  }

  async function onCalibrationSubmit(event) {
    event.preventDefault();
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

    state = await api.createCalibration(payload);
    render();
    event.currentTarget.reset();
  }

  async function handleProjectAction(action, id) {
    const project = getProjectById(id);
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
      fillProjectForm(project);
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
      state = await api.deleteProject(id);
      if (ui.selectedProjectId === id) {
        ui.selectedProjectId = null;
        ui.section = "projects";
      }
      ensureSelection();
      render();
    }
  }

  async function handlePersonaAction(action, id) {
    const persona = getPersonaById(id);
    if (!persona) {
      return;
    }

    if (action === "edit") {
      ui.editingPersonaId = id;
      fillPersonaForm(persona);
      return;
    }

    if (action === "duplicate") {
      state = await api.duplicatePersona(id);
      ensureSelection();
      render();
      return;
    }

    if (action === "archive") {
      state = await api.archivePersona(id);
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
      state = await api.deletePersona(id);
      ensureSelection();
      render();
    }
  }

  async function handleTaskAction(action, id) {
    const task = getTaskById(id);
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
      state = await api.deleteTask(id);
      ensureSelection();
      render();
      return;
    }

    if (action === "clone-run") {
      state = await api.createRuns(id, task.persona_id, 1);
      ensureSelection();
      ui.section = "runs";
      render();
    }
  }

  async function handleRunAction(action, id) {
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
    state = await api.deleteRun(id);
    ensureSelection();
    render();
  }

  function confirmAction({ title, body, confirmLabel = "Confirmar" }) {
    const modal = document.getElementById("confirm-modal");
    document.getElementById("confirm-modal-title").textContent = title;
    document.getElementById("confirm-modal-body").textContent = body;
    document.getElementById("confirm-modal-confirm").textContent = confirmLabel;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    return new Promise((resolve) => {
      ui.confirmation = { resolve };
    });
  }

  function closeConfirmation(confirmed) {
    if (!ui.confirmation) {
      return;
    }
    const modal = document.getElementById("confirm-modal");
    const { resolve } = ui.confirmation;
    ui.confirmation = null;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    resolve(confirmed);
  }

  function render() {
    renderSection();
    renderRuntimeBadge();
    renderPolicy();
    renderProjects();
    renderPersonas();
    renderTasks();
    renderRuns();
    renderCalibration();
    renderDashboard();
  }

  function renderSection() {
    if (!ui.selectedProjectId && requiresProject(ui.section)) {
      ui.section = "projects";
    }
    if (!ui.selectedProjectId && ui.section === "dashboard") {
      ui.section = "projects";
    }
    navTabs.forEach((tab) => {
      const shouldHide = tab.dataset.section !== "projects" && !ui.selectedProjectId;
      tab.classList.toggle("hidden", shouldHide);
    });
    navTabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.section === ui.section));
    navTabs.forEach((tab) => tab.classList.toggle("is-disabled", !ui.selectedProjectId && requiresProject(tab.dataset.section)));
    sections.forEach((section) => section.classList.toggle("is-active", section.id === `section-${ui.section}`));
    sectionTitle.textContent = ui.section === "projects" ? "Projects" : ui.section.charAt(0).toUpperCase() + ui.section.slice(1);
  }

  function renderRuntimeBadge() {
    const badge = document.getElementById("runtime-badge");
    if (!badge) {
      return;
    }
    const engine = runtime.backend ? `backend · ${runtime.runner}` : "browser fallback";
    const mcpLabel = runtime.figma_mcp ? "Figma MCP ready" : `MCP ${runtime.mcp}`;
    const project = getProjectById(ui.selectedProjectId);
    badge.textContent = project ? `${project.name} · ${engine} · ${mcpLabel}` : `${engine} · ${mcpLabel}`;
  }

  function renderPolicy() {
    document.getElementById("policy-mandatory").innerHTML = POLICY.mandatory.map((item) => `<li>${item}</li>`).join("");
    document.getElementById("policy-guardrails").innerHTML = POLICY.guardrails.map((item) => `<li>${item}</li>`).join("");
  }

  function renderProjects() {
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
              <button class="ghost-button" data-project-action="delete" data-id="${project.id}">Borrar</button>
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

  function renderPersonas() {
    const list = document.getElementById("persona-list");
    const projectId = ui.selectedProjectId;
    const personas = projectId ? state.personas.filter((item) => item.project_id === projectId) : [];
    const personasHtml = personas
      .map((persona) => {
        const selected = persona.id === ui.selectedPersonaId ? " is-selected" : "";
        const runCount = state.runs.filter((run) => run.persona_id === persona.id).length;
        return `
          <article class="list-card${selected}" data-persona-id="${persona.id}">
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
              <button class="ghost-button" data-persona-action="delete" data-id="${persona.id}">Borrar</button>
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

  function renderTasks() {
    const list = document.getElementById("task-list");
    const projectId = ui.selectedProjectId;
    const tasks = projectId ? state.tasks.filter((item) => item.project_id === projectId) : [];
    const tasksHtml = tasks
      .map((task) => {
        const persona = getPersonaById(task.persona_id);
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
              <button class="ghost-button" data-task-action="delete" data-id="${task.id}">Borrar</button>
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

  function renderRuns() {
    const list = document.getElementById("run-list");
    const projectId = ui.selectedProjectId;
    const runs = projectId ? state.runs.filter((item) => item.project_id === projectId) : [];
    const runsHtml = runs
      .map((run) => {
        const persona = getPersonaById(run.persona_id);
        const task = getTaskById(run.task_id);
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
              <span class="pill${run.engine === "figma-mcp" ? " engine-figma-mcp" : ""}">${escapeHtml(run.engine || "simulated")}</span>
            </div>
            <p>${escapeHtml(run.report_summary)}</p>
            <div class="action-row">
              <button class="ghost-button" data-run-action="delete" data-id="${run.id}">Borrar run</button>
            </div>
          </article>
        `;
      })
      .join("");
    list.innerHTML = projectId
      ? runsHtml || emptyStateMarkup("Todavia no hay corridas en este proyecto.")
      : emptyStateMarkup("Primero crea o selecciona un proyecto para ejecutar runs.");
    toggleFormDisabled("run-form", Boolean(projectId));

    document.querySelectorAll(".pill-button").forEach((button) =>
      button.classList.toggle("is-active", button.dataset.detailView === ui.runDetailView)
    );

    const detail = document.getElementById("run-detail");
    const run = getRunById(ui.selectedRunId);
    const title = document.getElementById("run-detail-title");

    if (!run) {
      title.textContent = "Selecciona una corrida";
      detail.innerHTML = emptyStateMarkup("No hay detalle disponible.");
      return;
    }

    const persona = getPersonaById(run.persona_id);
    const task = getTaskById(run.task_id);
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

  function renderCalibration() {
    const list = document.getElementById("calibration-list");
    const projectId = ui.selectedProjectId;
    const calibrations = projectId ? state.calibrations.filter((item) => item.project_id === projectId) : [];
    const calibrationHtml = calibrations
      .map((record) => {
        const persona = getPersonaById(record.persona_id);
        const task = getTaskById(record.task_id);
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

  function renderDashboard() {
    const project = getProjectById(ui.selectedProjectId);
    const globalProjects = state.projects || [];
    const globalPersonas = state.personas || [];
    const globalTasks = state.tasks || [];
    const globalRuns = state.runs || [];
    const globalCalibrations = state.calibrations || [];
    const projectPersonas = project ? state.personas.filter((item) => item.project_id === project.id) : [];
    const projectTasks = project ? state.tasks.filter((item) => item.project_id === project.id) : [];
    const globalHero = document.getElementById("hero-meta-global");
    const globalMetrics = document.getElementById("global-metrics-grid");
    const globalProjectList = document.getElementById("dashboard-project-list");
    const globalView = document.getElementById("dashboard-global-view");
    const projectView = document.getElementById("dashboard-project-view");

    if (!project) {
      globalView.classList.remove("hidden");
      projectView.classList.add("hidden");
      globalHero.innerHTML = `<div class="hero-chip"><span class="metric-label">Estado</span><strong>Selecciona un proyecto</strong></div>`;
      globalMetrics.innerHTML = [
        metricCard("Usuarios creados", `${globalPersonas.length}`, "Personas sintéticas registradas"),
        metricCard("Runs", `${globalRuns.length}`, "Corridas acumuladas"),
        metricCard("Tasks", `${globalTasks.length}`, "Tareas definidas"),
        metricCard("Benchmarks", `${globalCalibrations.length}`, "Calibraciones humanas"),
        metricCard("Proyecto mas activo", `${mostActiveProjectLabel()}`, "Segun cantidad de runs"),
        metricCard("Proyectos listos", `${globalProjects.length}`, "Espacios disponibles para trabajar")
      ].join("");
      globalProjectList.innerHTML =
        globalProjects
          .map((item) => {
            const personas = globalPersonas.filter((entry) => entry.project_id === item.id).length;
            const tasks = globalTasks.filter((entry) => entry.project_id === item.id).length;
            const runs = globalRuns.filter((entry) => entry.project_id === item.id).length;
            return `
              <article class="list-card" data-project-id="${item.id}">
                <header>
                  <div>
                    <strong>${escapeHtml(item.name)}</strong>
                    <p>${escapeHtml(item.description || "Sin descripcion")}</p>
                  </div>
                  <span class="tag">${formatShortDate(item.created_at)}</span>
                </header>
                <div class="meta-row">
                  <span class="pill">${personas} personas</span>
                  <span class="pill">${tasks} tasks</span>
                  <span class="pill">${runs} runs</span>
                </div>
                <div class="action-row">
                  <button class="ghost-button" data-project-action="select" data-id="${item.id}">Seleccionar proyecto</button>
                </div>
              </article>
            `;
          })
          .join("") || emptyStateMarkup("Todavia no hay proyectos. Crea uno para empezar.");
      return;
    }

    globalView.classList.add("hidden");
    projectView.classList.remove("hidden");
    const filteredRuns = getFilteredRuns();
    const metrics = computeMetrics(filteredRuns);
    const heroMeta = document.getElementById("hero-meta");
    heroMeta.innerHTML = `
      <div class="hero-chip"><span class="metric-label">Proyecto activo</span><strong>${project ? escapeHtml(project.name) : "Sin proyecto"}</strong></div>
      <div class="hero-chip"><span class="metric-label">Runs activos</span><strong>${filteredRuns.length}</strong></div>
      <div class="hero-chip"><span class="metric-label">Personas</span><strong>${projectPersonas.length}</strong></div>
      <div class="hero-chip"><span class="metric-label">Tasks</span><strong>${projectTasks.length}</strong></div>
      <div class="hero-chip"><span class="metric-label">Backend</span><strong>${runtime.backend ? "API local" : "fallback"}</strong></div>
    `;

    document.getElementById("metrics-grid").innerHTML = [
      metricCard("Task success rate", `${metrics.successRate}%`, "Corridas completadas"),
      metricCard("Abandonment rate", `${metrics.abandonRate}%`, "Abandono explicito"),
      metricCard("Average completion time", `${metrics.avgSeconds}s`, "Promedio por corrida"),
      metricCard("Average steps", `${metrics.avgSteps}`, "Secuencia observada"),
      metricCard("Critical friction count", `${metrics.criticalCount}`, "Bloqueos recurrentes"),
      metricCard("Consistency score", `${metrics.consistency}%`, "Estabilidad del arquetipo")
    ].join("");

    fillSelect("filter-persona", [{ id: "all", name: "Todas" }, ...projectPersonas], ui.filters.personaId, false);
    fillSelect("filter-task", [{ id: "all", prompt: "Todas" }, ...projectTasks], ui.filters.taskId, false, (task) => task.prompt || task.name);

    renderRouteList(filteredRuns);
    renderFindingList(filteredRuns);
    drawAggregateVisuals(filteredRuns);
  }

  function renderRouteList(runs) {
    const routeCounts = {};
    runs.forEach((run) => {
      const route = run.screen_transitions.map((transition) => `${transition.from} → ${transition.to}`).join(" · ") || "Single screen";
      routeCounts[route] = (routeCounts[route] || 0) + 1;
    });

    const total = runs.length || 1;
    const entries = Object.entries(routeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const html = entries
      .map(([route, count]) => {
        const percent = Math.round((count / total) * 100);
        return `
          <div class="sankey-block">
            <strong>${escapeHtml(route)}</strong>
            <span>${count} runs · ${percent}%</span>
            <div class="bar-track"><div class="bar-fill" style="width:${percent}%"></div></div>
          </div>
        `;
      })
      .join("");
    document.getElementById("route-list").innerHTML = html || emptyStateMarkup("Aun no hay rutas observadas.");
  }

  function renderFindingList(runs) {
    const findings = {};
    runs.forEach((run) => {
      run.report_details.prioritized_findings.forEach((finding) => {
        findings[finding.label] = findings[finding.label] || { ...finding, count: 0 };
        findings[finding.label].count += 1;
      });
    });

    const html = Object.values(findings)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
      .map(
        (finding) => `
          <article class="list-card">
            <header>
              <strong>${escapeHtml(finding.label)}</strong>
              <span class="status-pill ${severityToClass(finding.severity)}">${finding.severity}</span>
            </header>
            <p>${escapeHtml(finding.detail)}</p>
            <div class="meta-row"><span class="pill">${finding.count} repeticiones</span></div>
          </article>
        `
      )
      .join("");
    document.getElementById("finding-list").innerHTML = html || emptyStateMarkup("Aun no hay hallazgos sintetizados.");
  }

  async function drawAggregateVisuals(runs) {
    const heatmapCanvas = document.getElementById("aggregate-heatmap");
    const scanpathCanvas = document.getElementById("aggregate-scanpath");
    const firstScreenshot = runs.find((r) => r.screenshots && r.screenshots.length);
    const screenshotSrc = firstScreenshot ? firstScreenshot.screenshots[0].src : null;
    const img = await loadScreenshot(screenshotSrc);
    drawBackground(heatmapCanvas.getContext("2d"), heatmapCanvas, img, "Heatmap agregado");
    drawBackground(scanpathCanvas.getContext("2d"), scanpathCanvas, img, "Scanpath agregado");

    const clickPoints = runs.flatMap((run) => run.click_points || []);
    drawHeatPoints(heatmapCanvas.getContext("2d"), clickPoints);
    drawScanPoints(scanpathCanvas.getContext("2d"), clickPoints.slice(0, 18));
  }

  async function drawRunObserved(run) {
    const heatCanvas = document.getElementById("run-heatmap");
    const scanCanvas = document.getElementById("run-scanpath");
    if (!heatCanvas || !scanCanvas) {
      return;
    }
    const screenshotSrc = run.screenshots && run.screenshots.length ? run.screenshots[0].src : null;
    const img = await loadScreenshot(screenshotSrc);
    const title = run.report_details.primary_screen || "Observed";
    drawBackground(heatCanvas.getContext("2d"), heatCanvas, img, title);
    drawBackground(scanCanvas.getContext("2d"), scanCanvas, img, title);
    drawHeatPoints(heatCanvas.getContext("2d"), run.click_points || []);
    drawScanPoints(scanCanvas.getContext("2d"), run.click_points || []);
  }

  async function drawPredictiveCanvas(run) {
    const predictiveCanvas = document.getElementById("run-predictive");
    if (!predictiveCanvas) {
      return;
    }
    const screenshotSrc = run.screenshots && run.screenshots.length ? run.screenshots[0].src : null;
    const img = await loadScreenshot(screenshotSrc);
    drawBackground(predictiveCanvas.getContext("2d"), predictiveCanvas, img, "Predictive attention");
    if (run.predicted_attention_maps && run.predicted_attention_maps.length) {
      drawHeatPoints(predictiveCanvas.getContext("2d"), run.predicted_attention_maps[0].points, true);
    }
  }

  function observedDetailHtml(run) {
    return `
      <div class="panel-grid">
        <div class="detail-card">
          <p class="eyebrow">Execution mode</p>
          <p>${escapeHtml(run.engine || "simulated")} · ${escapeHtml(run.execution_notes || "Sin notas")}</p>
          <div class="meta-row">
            <span class="pill">MCP ${run.mcp_enabled ? "enabled" : "off"}</span>
            <span class="pill">${escapeHtml(run.source || "local")}</span>
          </div>
        </div>
        <div class="detail-card">
          <p class="eyebrow">Completion</p>
          <p>${escapeHtml(run.completion_status)}</p>
          <div class="meta-row">
            <span class="pill">${run.step_log.length} pasos</span>
            <span class="pill">${run.click_points.length} clicks</span>
          </div>
        </div>
      </div>
      <div class="run-detail-grid">
        <div class="detail-card">
          <div class="visual-stage">
            <canvas id="run-heatmap" width="360" height="640"></canvas>
          </div>
        </div>
        <div class="detail-card">
          <div class="visual-stage">
            <canvas id="run-scanpath" width="360" height="640"></canvas>
          </div>
        </div>
      </div>
      <div class="panel-grid">
        <div class="timeline-card">
          <p class="eyebrow">Screens</p>
          <div class="screens-grid">
            ${(run.screenshots || [])
              .map(
                (item) => `
                  <figure>
                    <img src="${item.src}" alt="${escapeHtml(item.screen)}" />
                    <figcaption>${escapeHtml(item.screen)} · paso ${item.step}</figcaption>
                  </figure>
                `
              )
              .join("")}
          </div>
        </div>
        <div class="timeline-card">
          <p class="eyebrow">Timeline</p>
          <div class="timeline">
            ${(run.step_log || [])
              .map(
                (step) => `
                  <div class="timeline-entry">
                    <strong>Paso ${step.step} · ${escapeHtml(step.action)}</strong>
                    <p>${escapeHtml(step.reason)}</p>
                    <p>${escapeHtml(step.screen)} · ${step.certainty}% certeza</p>
                  </div>
                `
              )
              .join("")}
          </div>
        </div>
      </div>
    `;
  }

  function inferredDetailHtml(run, persona, task) {
    return `
      <div class="panel-grid">
        <div class="detail-card">
          <p class="eyebrow">Persona response</p>
          <p>${escapeHtml(run.persona_response)}</p>
          <div class="meta-row">
            ${(run.follow_up_questions || []).map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("")}
          </div>
        </div>
        <div class="detail-card">
          <p class="eyebrow">Research report</p>
          <p><strong>Resumen:</strong> ${escapeHtml(run.report_summary)}</p>
          <p><strong>Persona:</strong> ${persona ? escapeHtml(persona.name) : "N/A"}</p>
          <p><strong>Task:</strong> ${task ? escapeHtml(task.prompt) : "N/A"}</p>
          <div class="timeline">
            ${(run.report_details.prioritized_findings || [])
              .map(
                (finding) => `
                  <div class="timeline-entry">
                    <strong>${escapeHtml(finding.label)}</strong>
                    <p>${escapeHtml(finding.detail)}</p>
                    <span class="status-pill ${severityToClass(finding.severity)}">${finding.severity}</span>
                  </div>
                `
              )
              .join("")}
          </div>
        </div>
      </div>
    `;
  }

  function predictiveDetailHtml(run, task) {
    const enabled = task && task.predictive_attention_enabled;
    return `
      <div class="panel-grid">
        <div class="detail-card">
          <div class="visual-stage">
            <canvas id="run-predictive" width="360" height="640"></canvas>
          </div>
        </div>
        <div class="detail-card">
          <p class="eyebrow">Contexto</p>
          <p>
            Esta vista representa una capa estimada de atencion visual. Esta separada de los clicks reales y de la ruta
            observada para evitar confundir prediccion con evidencia.
          </p>
          <div class="timeline">
            ${
              run.predicted_attention_maps && run.predicted_attention_maps.length
                ? run.predicted_attention_maps[0].notes
                    .map((note) => `<div class="timeline-entry"><p>${escapeHtml(note)}</p></div>`)
                    .join("")
                : `<div class="empty-state">${enabled ? "No se genero mapa predictivo en este run." : "El task no activo predictive attention."}</div>`
            }
          </div>
        </div>
      </div>
    `;
  }

  function skillAnalysisHtml(run) {
    if (!skillsCache.loaded || !skillsCache.list.length) return "";
    const providers = runtime.skills?.providers_available || [];
    if (!providers.length) return "";

    const options = skillsCache.list
      .filter((s) => !s.batch)
      .map((s) => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`)
      .join("");
    const batchOptions = skillsCache.list
      .filter((s) => s.batch)
      .map((s) => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`)
      .join("");
    const providerOptions = providers
      .map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`)
      .join("");
    const isAnalyzing = skillsCache.analyzing;
    const hasResult = skillsCache.lastResult && skillsCache.lastRunId === run.id;

    return `
      <div class="detail-card skill-analysis-panel">
        <p class="eyebrow">Analisis con skills</p>
        <div class="skill-controls">
          <select id="skill-picker">${options}</select>
          <select id="skill-provider-picker">${providerOptions}</select>
          <button class="ghost-button" data-skill-action="analyze" ${isAnalyzing ? "disabled" : ""}>
            ${isAnalyzing ? "Analizando..." : "Analizar"}
          </button>
        </div>
        ${hasResult ? renderSkillResult(skillsCache.lastResult) : ""}
      </div>
    `;
  }

  function skillBatchHtml(runs) {
    if (!skillsCache.loaded || !skillsCache.list.length) return "";
    const providers = runtime.skills?.providers_available || [];
    if (!providers.length) return "";
    const batchSkills = skillsCache.list.filter((s) => s.batch);
    if (!batchSkills.length) return "";

    const options = batchSkills
      .map((s) => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`)
      .join("");
    const providerOptions = providers
      .map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`)
      .join("");

    return `
      <div class="detail-card skill-analysis-panel">
        <p class="eyebrow">Analisis batch (${runs.length} runs)</p>
        <div class="skill-controls">
          <select id="skill-batch-picker">${options}</select>
          <select id="skill-batch-provider-picker">${providerOptions}</select>
          <button class="ghost-button" data-skill-action="analyze-batch" ${skillsCache.analyzing ? "disabled" : ""}>
            ${skillsCache.analyzing ? "Analizando..." : "Analizar todos"}
          </button>
        </div>
      </div>
    `;
  }

  function renderSkillResult(result) {
    if (!result) return "";
    if (!result.ok) {
      return `
        <div class="skill-result skill-result-error">
          <p><strong>Error:</strong> ${escapeHtml(result.error || "Error desconocido")}</p>
          ${result.details ? `<p class="meta-row">${result.details.map((d) => `<span class="pill">${escapeHtml(d)}</span>`).join("")}</p>` : ""}
        </div>
      `;
    }

    const meta = `<div class="meta-row">
      <span class="pill">${escapeHtml(result.provider)}</span>
      <span class="pill">${escapeHtml(result.model)}</span>
      <span class="pill">${result.latency_ms}ms</span>
    </div>`;

    const output = result.output;
    let body = "";

    if (output.findings) {
      body = output.findings
        .map((f) => `
          <div class="timeline-entry">
            <strong>${escapeHtml(f.label)}</strong>
            <span class="status-pill ${severityToClass(f.severity)}">${f.severity}</span>
            <p>${escapeHtml(f.detail)}</p>
            ${f.recommendation ? `<p class="skill-recommendation">${escapeHtml(f.recommendation)}</p>` : ""}
            ${f.evidence_steps ? `<p class="meta-row">${f.evidence_steps.map((s) => `<span class="pill">paso ${s}</span>`).join("")}</p>` : ""}
          </div>
        `)
        .join("");
    } else if (output.issues) {
      body = output.issues
        .map((i) => `
          <div class="timeline-entry">
            <strong>${escapeHtml(i.label)}</strong>
            <span class="status-pill ${severityToClass(i.severity)}">${i.severity}</span>
            <span class="pill">${escapeHtml(i.category)}</span>
            <p>${escapeHtml(i.detail)}</p>
            ${i.recommendation ? `<p class="skill-recommendation">${escapeHtml(i.recommendation)}</p>` : ""}
          </div>
        `)
        .join("");
    } else if (output.deviations) {
      const coherenceClass = output.coherent ? "status-completed" : "status-abandoned";
      body = `
        <div class="timeline-entry">
          <strong>Score: ${output.score}</strong>
          <span class="status-pill ${coherenceClass}">${output.coherent ? "coherente" : "incoherente"}</span>
          <p>${escapeHtml(output.explanation)}</p>
        </div>
        ${output.deviations.map((d) => `
          <div class="timeline-entry">
            <strong>${escapeHtml(d.label)}</strong>
            <span class="status-pill ${severityToClass(d.severity)}">${d.severity}</span>
            <p>${escapeHtml(d.detail)}</p>
            ${d.expected_behavior ? `<p class="skill-recommendation">${escapeHtml(d.expected_behavior)}</p>` : ""}
            ${d.evidence_step ? `<span class="pill">paso ${d.evidence_step}</span>` : ""}
          </div>
        `).join("")}
      `;
    } else if (output.recommendations) {
      body = output.recommendations
        .map((r) => `
          <div class="timeline-entry">
            <strong>#${r.priority} ${escapeHtml(r.label)}</strong>
            <span class="pill">${escapeHtml(r.type)}</span>
            <span class="status-pill ${severityToClass(r.expected_impact === "high" ? "high" : r.expected_impact === "medium" ? "medium" : "low")}">${r.expected_impact || "medium"}</span>
            <p>${escapeHtml(r.detail)}</p>
          </div>
        `)
        .join("");
    }

    return `
      <div class="skill-result">
        ${output.summary ? `<p><strong>${escapeHtml(output.summary)}</strong></p>` : ""}
        ${meta}
        <div class="timeline">${body}</div>
        <button class="ghost-button" data-skill-action="toggle-raw" style="margin-top:8px">Ver JSON crudo</button>
        <pre id="skill-raw-output" class="hidden" style="max-height:300px;overflow:auto;font-size:11px;background:var(--surface-1);padding:8px;border-radius:6px">${escapeHtml(JSON.stringify(output, null, 2))}</pre>
      </div>
    `;
  }

  async function handleSkillAnalyze() {
    const picker = document.getElementById("skill-picker");
    const providerPicker = document.getElementById("skill-provider-picker");
    if (!picker || !ui.selectedRunId) return;
    const skillName = picker.value;
    const provider = providerPicker?.value || undefined;
    skillsCache.analyzing = true;
    renderRuns();
    try {
      const result = await request(`/api/skills/${encodeURIComponent(skillName)}/run`, {
        method: "POST",
        body: JSON.stringify({ run_ids: [ui.selectedRunId], provider })
      });
      skillsCache.lastResult = result;
      skillsCache.lastRunId = ui.selectedRunId;
      skillsCache.lastSkill = skillName;
    } catch (error) {
      skillsCache.lastResult = { ok: false, error: error.message };
      skillsCache.lastRunId = ui.selectedRunId;
    }
    skillsCache.analyzing = false;
    renderRuns();
  }

  async function handleSkillAnalyzeBatch() {
    const picker = document.getElementById("skill-batch-picker");
    const providerPicker = document.getElementById("skill-batch-provider-picker");
    if (!picker || !ui.selectedProjectId) return;
    const skillName = picker.value;
    const provider = providerPicker?.value || undefined;
    const projectRuns = state.runs.filter((r) => r.project_id === ui.selectedProjectId);
    if (!projectRuns.length) return;
    skillsCache.analyzing = true;
    renderRuns();
    try {
      const result = await request(`/api/skills/${encodeURIComponent(skillName)}/run`, {
        method: "POST",
        body: JSON.stringify({ run_ids: projectRuns.map((r) => r.id), provider })
      });
      skillsCache.lastResult = result;
      skillsCache.lastRunId = "batch";
      skillsCache.lastSkill = skillName;
    } catch (error) {
      skillsCache.lastResult = { ok: false, error: error.message };
      skillsCache.lastRunId = "batch";
    }
    skillsCache.analyzing = false;
    renderRuns();
  }

  function fillProjectForm(project) {
    const form = document.getElementById("project-form");
    Object.keys(project).forEach((key) => {
      if (form.elements.namedItem(key)) {
        form.elements.namedItem(key).value = project[key];
      }
    });
    document.getElementById("project-form-title").textContent = `Editar ${project.name}`;
  }

  function fillPersonaForm(persona) {
    const form = document.getElementById("persona-form");
    Object.keys(persona).forEach((key) => {
      if (form.elements.namedItem(key)) {
        form.elements.namedItem(key).value = persona[key];
      }
    });
    document.getElementById("persona-form-title").textContent = `Editar ${persona.name}`;
  }

  function fillTaskForm(task) {
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
    document.getElementById("task-form-title").textContent = "Editar task";
  }

  function resetProjectForm() {
    ui.editingProjectId = null;
    const form = document.getElementById("project-form");
    form.reset();
    document.getElementById("project-form-title").textContent = "Crear proyecto";
  }

  function resetPersonaForm() {
    ui.editingPersonaId = null;
    const form = document.getElementById("persona-form");
    form.reset();
    document.getElementById("persona-form-title").textContent = "Crear persona";
  }

  function resetTaskForm() {
    ui.editingTaskId = null;
    const form = document.getElementById("task-form");
    form.reset();
    form.elements.namedItem("artifacts_enabled").checked = true;
    form.elements.namedItem("type").value = "navigation";
    document.getElementById("task-form-title").textContent = "Crear task";
  }

  function fillSelect(id, items, selectedId, keepPlaceholder, formatter) {
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

  function toggleFormDisabled(id, enabled) {
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

  function computeMetrics(runs) {
    if (!runs.length) {
      return { successRate: 0, abandonRate: 0, avgSeconds: 0, avgSteps: 0, criticalCount: 0, consistency: 0 };
    }

    const successCount = runs.filter((run) => run.completion_status === "completed").length;
    const abandonCount = runs.filter((run) => run.completion_status === "abandoned" || run.completion_status === "error").length;
    const avgSeconds = Math.round(
      runs.reduce((sum, run) => sum + (new Date(run.ended_at).getTime() - new Date(run.started_at).getTime()) / 1000, 0) / runs.length
    );
    const avgSteps = (runs.reduce((sum, run) => sum + run.step_log.length, 0) / runs.length).toFixed(1);
    const criticalCount = runs.reduce(
      (sum, run) => sum + (run.report_details.prioritized_findings || []).filter((finding) => finding.severity === "critical").length,
      0
    );
    const statusCounts = {};
    runs.forEach((run) => {
      statusCounts[run.persona_id] = statusCounts[run.persona_id] || { total: 0, completed: 0 };
      statusCounts[run.persona_id].total += 1;
      if (run.completion_status === "completed") {
        statusCounts[run.persona_id].completed += 1;
      }
    });
    const consistency = Math.round(
      Object.values(statusCounts).reduce((sum, item) => sum + (item.completed / item.total) * 100, 0) / Object.keys(statusCounts).length
    );
    return {
      successRate: Math.round((successCount / runs.length) * 100),
      abandonRate: Math.round((abandonCount / runs.length) * 100),
      avgSeconds,
      avgSteps,
      criticalCount,
      consistency
    };
  }

  function getFilteredRuns() {
    return state.runs.filter((run) => {
      if (ui.selectedProjectId && run.project_id !== ui.selectedProjectId) {
        return false;
      }
      if (ui.filters.personaId !== "all" && run.persona_id !== ui.filters.personaId) {
        return false;
      }
      if (ui.filters.taskId !== "all" && run.task_id !== ui.filters.taskId) {
        return false;
      }
      if (ui.filters.status !== "all" && run.completion_status !== ui.filters.status) {
        return false;
      }
      return true;
    });
  }

  function metricCard(label, valueText, caption) {
    return `
      <article class="metric-card">
        <div class="metric-label">${label}</div>
        <strong class="metric-value">${valueText}</strong>
        <p class="metric-caption">${caption}</p>
      </article>
    `;
  }

  async function exportState() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "sinteticos-lab-state.json";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function resetDemoData() {
    const confirmed = await confirmAction({
      title: "Recrear demo y reemplazar estado local",
      body: "Esto reemplazara las personas, tasks, runs y benchmarks actuales por los datos demo. Si quieres conservar tu trabajo, cancela esta accion.",
      confirmLabel: "Recrear demo"
    });
    if (!confirmed) {
      return;
    }
    state = await api.resetDemo();
    ensureSelection();
    ui.section = "projects";
    render();
  }

  function ensureSelection() {
    if (ui.selectedProjectId && !getProjectById(ui.selectedProjectId)) {
      ui.selectedProjectId = null;
    }
    const projectId = ui.selectedProjectId;
    const selectedPersona = ui.selectedPersonaId ? getPersonaById(ui.selectedPersonaId) : null;
    if (!selectedPersona || selectedPersona.project_id !== projectId) {
      ui.selectedPersonaId = state.personas.find((item) => item.project_id === projectId)?.id || null;
    }
    const selectedTask = ui.selectedTaskId ? getTaskById(ui.selectedTaskId) : null;
    if (!selectedTask || selectedTask.project_id !== projectId) {
      ui.selectedTaskId = state.tasks.find((item) => item.project_id === projectId)?.id || null;
    }
    const selectedRun = ui.selectedRunId ? getRunById(ui.selectedRunId) : null;
    if (!selectedRun || selectedRun.project_id !== projectId) {
      ui.selectedRunId = state.runs.find((item) => item.project_id === projectId)?.id || null;
    }
  }

  function createApi() {
    return {
      async health() {
        try {
          const response = await fetch("/api/health");
          if (!response.ok) {
            throw new Error("health");
          }
          const payload = await response.json();
          return {
            mode: "backend",
            backend: true,
            runner: payload.runner || "simulated",
            mcp: payload.mcp || "optional",
            figma_mcp: payload.figma_mcp || false,
            skills: payload.skills || null
          };
        } catch (error) {
          return { mode: "browser", backend: false, runner: "simulated", mcp: "optional", figma_mcp: false };
        }
      },

      async loadState() {
        if (runtime.backend) {
          const payload = await request("/api/state");
          return payload.state;
        }
        return loadLocalState();
      },

      async createProject(payload) {
        if (runtime.backend) {
          return (await request("/api/projects", { method: "POST", body: JSON.stringify(payload) })).state;
        }
        const next = localCreateProject(payload);
        persistLocalState(next);
        return next;
      },

      async updateProject(id, payload) {
        if (runtime.backend) {
          return (await request(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(payload) })).state;
        }
        const next = localUpdateProject(id, payload);
        persistLocalState(next);
        return next;
      },

      async deleteProject(id) {
        if (runtime.backend) {
          return (await request(`/api/projects/${id}`, { method: "DELETE" })).state;
        }
        const next = localDeleteProject(id);
        persistLocalState(next);
        return next;
      },

      async createPersona(payload) {
        if (runtime.backend) {
          return (await request("/api/personas", { method: "POST", body: JSON.stringify(payload) })).state;
        }
        const next = localCreatePersona(payload);
        persistLocalState(next);
        return next;
      },

      async updatePersona(id, payload) {
        if (runtime.backend) {
          return (await request(`/api/personas/${id}`, { method: "PATCH", body: JSON.stringify(payload) })).state;
        }
        const next = localUpdatePersona(id, payload);
        persistLocalState(next);
        return next;
      },

      async duplicatePersona(id) {
        if (runtime.backend) {
          return (await request(`/api/personas/${id}/duplicate`, { method: "POST" })).state;
        }
        const next = localDuplicatePersona(id);
        persistLocalState(next);
        return next;
      },

      async archivePersona(id) {
        if (runtime.backend) {
          return (await request(`/api/personas/${id}/archive`, { method: "POST" })).state;
        }
        const next = localArchivePersona(id);
        persistLocalState(next);
        return next;
      },

      async deletePersona(id) {
        if (runtime.backend) {
          return (await request(`/api/personas/${id}`, { method: "DELETE" })).state;
        }
        const next = localDeletePersona(id);
        persistLocalState(next);
        return next;
      },

      async createTask(payload) {
        if (runtime.backend) {
          return (await request("/api/tasks", { method: "POST", body: JSON.stringify(payload) })).state;
        }
        const next = localCreateTask(payload);
        persistLocalState(next);
        return next;
      },

      async updateTask(id, payload) {
        if (runtime.backend) {
          return (await request(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(payload) })).state;
        }
        const next = localUpdateTask(id, payload);
        persistLocalState(next);
        return next;
      },

      async deleteTask(id) {
        if (runtime.backend) {
          return (await request(`/api/tasks/${id}`, { method: "DELETE" })).state;
        }
        const next = localDeleteTask(id);
        persistLocalState(next);
        return next;
      },

      async createRuns(taskId, personaId, runCount) {
        if (runtime.backend) {
          return (
            await request(`/api/tasks/${taskId}/runs`, {
              method: "POST",
              body: JSON.stringify({ personaId, runCount })
            })
          ).state;
        }
        const next = localCreateRuns(taskId, personaId, runCount);
        persistLocalState(next);
        return next;
      },

      async createCalibration(payload) {
        if (runtime.backend) {
          return (await request("/api/calibrations", { method: "POST", body: JSON.stringify(payload) })).state;
        }
        const next = localCreateCalibration(payload);
        persistLocalState(next);
        return next;
      },

      async deleteRun(id) {
        if (runtime.backend) {
          return (await request(`/api/runs/${id}`, { method: "DELETE" })).state;
        }
        const next = localDeleteRun(id);
        persistLocalState(next);
        return next;
      },

      async resetDemo() {
        if (runtime.backend) {
          return (await request("/api/demo/reset", { method: "POST" })).state;
        }
        const next = buildInitialState();
        persistLocalState(next);
        return next;
      }
    };
  }

  async function request(path, init = {}) {
    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {})
      }
    });
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
  }

  function localCreateProject(payload) {
    const now = new Date().toISOString();
    const project = {
      id: uid("project"),
      name: payload.name || "Proyecto sin nombre",
      description: payload.description || "",
      created_at: now,
      updated_at: now
    };
    return { ...state, projects: [project, ...(state.projects || [])] };
  }

  function localUpdateProject(id, payload) {
    return {
      ...state,
      projects: (state.projects || []).map((item) =>
        item.id === id ? { ...item, ...payload, updated_at: new Date().toISOString() } : item
      )
    };
  }

  function localDeleteProject(id) {
    const taskIds = state.tasks.filter((item) => item.project_id === id).map((item) => item.id);
    const personaIds = state.personas.filter((item) => item.project_id === id).map((item) => item.id);
    return {
      ...state,
      projects: (state.projects || []).filter((item) => item.id !== id),
      personas: state.personas.filter((item) => item.project_id !== id),
      tasks: state.tasks.filter((item) => item.project_id !== id),
      runs: state.runs.filter((item) => item.project_id !== id && !taskIds.includes(item.task_id) && !personaIds.includes(item.persona_id)),
      calibrations: state.calibrations.filter((item) => item.project_id !== id)
    };
  }

  function localCreatePersona(payload) {
    const now = new Date().toISOString();
    const persona = {
      id: uid("persona"),
      ...payload,
      status: "active",
      version: 1,
      created_at: now,
      updated_at: now
    };
    return { ...state, personas: [persona, ...state.personas] };
  }

  function localUpdatePersona(id, payload) {
    return {
      ...state,
      personas: state.personas.map((item) =>
        item.id === id ? { ...item, ...payload, version: item.version + 1, updated_at: new Date().toISOString() } : item
      )
    };
  }

  function localDuplicatePersona(id) {
    const persona = getPersonaById(id);
    if (!persona) {
      return state;
    }
    const duplicate = {
      ...persona,
      id: uid("persona"),
      name: `${persona.name} Copy`,
      status: "draft",
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    return { ...state, personas: [duplicate, ...state.personas] };
  }

  function localArchivePersona(id) {
    return {
      ...state,
      personas: state.personas.map((item) =>
        item.id === id ? { ...item, status: item.status === "archived" ? "active" : "archived", updated_at: new Date().toISOString() } : item
      )
    };
  }

  function localDeletePersona(id) {
    return { ...state, personas: state.personas.filter((item) => item.id !== id) };
  }

  function localCreateTask(payload) {
    const task = {
      id: uid("task"),
      ...payload,
      status: "ready",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    return { ...state, tasks: [task, ...state.tasks] };
  }

  function localUpdateTask(id, payload) {
    return {
      ...state,
      tasks: state.tasks.map((item) => (item.id === id ? { ...item, ...payload, updated_at: new Date().toISOString() } : item))
    };
  }

  function localDeleteTask(id) {
    return { ...state, tasks: state.tasks.filter((item) => item.id !== id) };
  }

  function localCreateRuns(taskId, personaId, runCount) {
    const task = state.tasks.find((item) => item.id === taskId);
    const persona = state.personas.find((item) => item.id === personaId);
    if (!task || !persona) {
      return state;
    }
    const newRuns = Array.from({ length: runCount }, (_, index) => simulateRun(task, persona, index + 1));
    return { ...state, runs: [...newRuns.reverse(), ...state.runs] };
  }

  function localCreateCalibration(payload) {
    const calibration = { id: uid("calibration"), ...payload, created_at: new Date().toISOString() };
    return { ...state, calibrations: [calibration, ...state.calibrations] };
  }

  function localDeleteRun(id) {
    return { ...state, runs: state.runs.filter((item) => item.id !== id) };
  }

  function emptyState() {
    return { projects: [], personas: [], tasks: [], runs: [], calibrations: [] };
  }

  function loadLocalState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const seeded = buildInitialState();
        persistLocalState(seeded);
        return seeded;
      }
      return JSON.parse(raw);
    } catch (error) {
      const seeded = buildInitialState();
      persistLocalState(seeded);
      return seeded;
    }
  }

  function persistLocalState(nextState) {
    state = nextState;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  }

  function buildInitialState() {
    const now = new Date().toISOString();
    const project = {
      id: uid("project"),
      name: "Demo workspace",
      description: "Proyecto demo para explorar arquetipos, tareas y corridas del laboratorio.",
      created_at: now,
      updated_at: now
    };
    const personaA = {
      id: uid("persona"),
      project_id: project.id,
      name: "Catalina, viajera practica",
      description: "Busca resolver rapido y no tolera pasos ambiguos cuando esta en movimiento.",
      role: "Profesional comercial",
      segment: "Planificadora de escapadas cortas",
      functional_context: "Organiza viajes personales entre reuniones y trayectos.",
      usage_context: "Movil, ratos cortos, multitarea.",
      goals: "Encontrar una opcion confiable y cerrar rapido.",
      motivations: "Ahorrar tiempo y evitar errores en reserva.",
      needs: "Claridad en costos, confianza y continuidad entre pantallas.",
      behaviors: "Compara un poco, luego decide por conveniencia.",
      pains: "Formularios largos, mensajes ambiguos y sorpresas al final.",
      frictions: "Carga cognitiva alta y dudas en el siguiente paso.",
      personality_traits: "Directa, apurada, cautelosa con pagos.",
      digital_environment: "Usa apps de viajes y productividad todo el dia.",
      digital_behavior: "Mobile-first, explora poco y abandona rapido si algo no cierra.",
      devices: "iPhone y notebook de trabajo",
      digital_level: "medium",
      apps_used: "Booking, Airbnb, Google Maps, Notion",
      restrictions: "Poco tiempo, mala conectividad ocasional.",
      attachments: "",
      status: "active",
      version: 1,
      created_at: now,
      updated_at: now
    };

    const personaB = {
      id: uid("persona"),
      project_id: project.id,
      name: "Matias, comprador tecnico",
      description: "Detecta ineficiencias rapido y espera control sobre lo que hace.",
      role: "Ingeniero de software",
      segment: "Adoptador digital exigente",
      functional_context: "Evalua herramientas nuevas para uso personal y laboral.",
      usage_context: "Desktop-first, sesiones mas largas.",
      goals: "Completar tareas con velocidad y transparencia.",
      motivations: "Reducir pasos innecesarios y entender el sistema.",
      needs: "Senales claras de estado, consistencia y baja friccion.",
      behaviors: "Explora por su cuenta, compara y cuestiona decisiones de interfaz.",
      pains: "Flows ineficientes, labels vagos, info oculta.",
      frictions: "Errores evitables y falta de feedback.",
      personality_traits: "Analitico, rapido, poco tolerante a fallas repetidas.",
      digital_environment: "Usa productos digitales de forma intensiva.",
      digital_behavior: "Desktop-first, baja tolerancia a fricciones evitables.",
      devices: "MacBook Pro y Android",
      digital_level: "high",
      apps_used: "Figma, Linear, Slack, Chrome, Gmail",
      restrictions: "No acepta pasos sin razon clara.",
      attachments: "",
      status: "active",
      version: 1,
      created_at: now,
      updated_at: now
    };

    const taskA = {
      id: uid("task"),
      project_id: project.id,
      persona_id: personaA.id,
      type: "navigation",
      prompt: "Estas buscando tu proximo lugar de vacaciones y quieres hacer un booking en el sitio.",
      url: "https://www.figma.com/proto/demo-vacation-flow",
      success_criteria: "Encontrar una propiedad y llegar al paso de booking con confianza.",
      max_steps: 6,
      mcp_enabled: true,
      predictive_attention_enabled: true,
      artifacts_enabled: true,
      status: "ready",
      created_at: now,
      updated_at: now
    };

    const taskB = {
      id: uid("task"),
      project_id: project.id,
      persona_id: personaB.id,
      type: "idea",
      prompt: "Validar una nueva feature que resume automaticamente comparativas de planes.",
      url: "",
      success_criteria: "Entender que tan util, creible y adoptable suena para el arquetipo.",
      max_steps: 4,
      mcp_enabled: false,
      predictive_attention_enabled: false,
      artifacts_enabled: true,
      status: "ready",
      created_at: now,
      updated_at: now
    };

    const runs = [simulateRun(taskA, personaA, 1), simulateRun(taskA, personaA, 2), simulateRun(taskB, personaB, 1)];
    const calibrations = [
      {
        id: uid("calibration"),
        project_id: project.id,
        persona_id: personaA.id,
        task_id: taskA.id,
        prototype_version: "vacation-flow-v1",
        human_result: "El benchmark humano encontro dudas en costos y miedo a errores antes de reservar.",
        synthetic_result: "El arquetipo abandono o dudo en el paso de decision cuando no se sintio control suficiente.",
        critical_findings: "Claridad del siguiente paso; confianza en accion principal",
        agreement: 72,
        notes: "Proxy calibrado para priorizar test humano posterior.",
        created_at: now
      }
    ];
    return { projects: [project], personas: [personaA, personaB], tasks: [taskA, taskB], runs, calibrations };
  }

  function simulateRun(task, persona, iteration) {
    const startedAt = new Date();
    const seed = hashString(`${task.id}:${persona.id}:${iteration}:${startedAt.toISOString()}`).toString().slice(0, 6);
    const rng = mulberry32(Number(seed));
    const stepCount = Math.max(2, Math.min(task.max_steps || 5, Math.floor(rng() * 4) + 3));
    const screens = task.type === "navigation" ? buildNavigationScreens(task, rng) : ["Idea brief", "Reaction", "Follow-up"];
    const clickPoints = [];
    const stepLog = [];
    const transitions = [];
    const certaintyBase = persona.digital_level === "high" ? 84 : persona.digital_level === "medium" ? 68 : 52;
    let completionStatus = "completed";

    for (let step = 1; step <= stepCount; step += 1) {
      const screen = screens[Math.min(step - 1, screens.length - 1)];
      const nextScreen = screens[Math.min(step, screens.length - 1)];
      const certainty = Math.max(28, Math.min(94, Math.round(certaintyBase - rng() * 18 + step * 2)));
      const x = 56 + Math.round(rng() * 248);
      const y = 130 + Math.round(rng() * 408);
      const action = chooseAction(task, step, stepCount, rng, certainty);
      const reason = composeStepReason(persona, task, action, screen, certainty);
      clickPoints.push({ x, y, step, screen, certainty, weight: Math.max(0.18, certainty / 100) });
      stepLog.push({ step, screen, action, reason, certainty, timestamp: new Date(startedAt.getTime() + step * 9500).toISOString() });
      if (screen !== nextScreen) {
        transitions.push({ from: screen, to: nextScreen, step });
      }
    }

    if (persona.digital_level === "low" && rng() > 0.52) {
      completionStatus = "abandoned";
    } else if (rng() > 0.72) {
      completionStatus = "uncertain";
    }

    const endedAt = new Date(startedAt.getTime() + stepCount * (9000 + Math.floor(rng() * 2500)));
    const screenshots = screens.map((screen, index) => ({
      screen,
      step: index + 1,
      src: buildScreenSvg(screen, task, persona, index)
    }));
    const findings = buildFindings(task, persona, completionStatus, rng);
    return {
      id: uid("run"),
      project_id: task.project_id || persona.project_id || null,
      task_id: task.id,
      persona_id: persona.id,
      persona_version: `v${persona.version}`,
      seed,
      status: "done",
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      completion_status: completionStatus,
      persona_response: composePersonaResponse(persona, task, completionStatus, findings, stepCount),
      step_log: stepLog,
      click_points: clickPoints,
      screen_transitions: transitions,
      screenshots,
      observed_heatmaps: [{ screen: screens[0], points: clickPoints }],
      observed_scanpaths: [{ screen: screens[0], points: clickPoints }],
      predicted_attention_maps: task.predictive_attention_enabled
        ? [{ screen: screens[0], points: buildPredictedPoints(rng), notes: buildPredictiveNotes(task, persona) }]
        : [],
      report_summary: summarizeRun(task, persona, completionStatus, findings),
      report_details: {
        primary_screen: screens[0],
        prioritized_findings: findings,
        trust_signals: [
          "Mensajes explicitos de avance",
          "Call to action visible en la zona superior",
          "Menor carga cognitiva cuando el siguiente paso se entiende rapido"
        ],
        rejection_signals: [
          "Etiquetas ambiguas",
          "Demasiadas decisiones juntas",
          "Baja claridad sobre lo que pasa despues"
        ]
      },
      follow_up_questions: buildFollowUps(task, completionStatus),
      engine: "browser-simulated",
      execution_notes: "Fallback local sin backend ni Playwright.",
      mcp_enabled: task.mcp_enabled,
      source: "client-local"
    };
  }

  function buildNavigationScreens(task, rng) {
    const hasBooking = /booking|reserva|vacacion|hotel/i.test(task.prompt);
    const hasCheckout = /checkout|pago|comprar|book/i.test(task.success_criteria);
    const host = getHostLabel(task.url || "figma.com");
    const screens = [`${host} cover`, "Browse options", hasBooking ? "Property details" : "Task details", "Decision point"];
    if (hasCheckout || rng() > 0.6) {
      screens.push("Checkout");
    }
    screens.push("Confirmation");
    return screens;
  }

  function chooseAction(task, step, stepCount, rng, certainty) {
    if (step === stepCount && certainty > 58) {
      return "complete";
    }
    if (certainty < 48 && rng() > 0.62) {
      return "abandon";
    }
    if (task.type === "idea") {
      return ["reflect", "question", "compare"][Math.floor(rng() * 3)];
    }
    return ["click_text", "click_region", "scroll", "wait"][Math.floor(rng() * 4)];
  }

  function composeStepReason(persona, task, action, screen, certainty) {
    const behavior = persona.digital_level === "high" ? "necesito control y senales claras" : persona.digital_level === "low" ? "necesito pasos mas guiados y familiares" : "necesito claridad suficiente para seguir sin friccion";
    return `En ${screen}, tome la accion ${action} porque ${behavior} y percibi una certeza de ${certainty}% frente al objetivo: ${task.prompt.toLowerCase()}.`;
  }

  function composePersonaResponse(persona, task, status, findings, stepCount) {
    const intro = `Yo llegue a esta prueba como ${persona.role || "usuario"} ${persona.segment ? `del segmento ${persona.segment}` : ""} y trate de ${task.prompt.toLowerCase()}.`;
    const understanding = task.type === "navigation"
      ? `Lo primero que entendi fue que tenia que recorrer un flujo con ${stepCount} pasos aproximados y fijarme rapido si podia avanzar sin sentirme perdido.`
      : "Lo primero que hice fue reaccionar desde mi contexto real y no desde una mirada experta del producto.";
    const friction = findings[0]
      ? `Lo que mas me freno fue ${findings[0].label.toLowerCase()}: ${findings[0].detail.toLowerCase()}.`
      : "No tengo suficiente informacion en mi perfil para responder eso con precision.";
    const confidence = status === "completed"
      ? "Segui porque el flujo me dio senales suficientes de control y continuidad."
      : "No llegue a sentir suficiente certeza para seguir con confianza.";
    const next = status === "abandoned" || status === "error"
      ? "Si esto me pasara en un uso real, probablemente lo dejaria para mas tarde o buscaria otra alternativa."
      : "Despues de esto seguiria evaluando si el flujo realmente vale el esfuerzo que me pide.";
    return `${intro} ${understanding} ${friction} ${confidence} ${next}`;
  }

  function summarizeRun(task, persona, status, findings) {
    const severity = findings[0] ? findings[0].severity : "medium";
    return `${persona.name} termino el task ${task.type} como ${status} con una friccion ${severity} centrada en ${findings[0] ? findings[0].label.toLowerCase() : "claridad general"}.`;
  }

  function buildFindings(task, persona, status, rng) {
    const level = persona.digital_level;
    return [
      {
        label: "Claridad del siguiente paso",
        severity: status === "abandoned" || status === "error" ? "critical" : "high",
        detail: level === "low"
          ? "El usuario necesita pasos mucho mas secuenciales para no perder confianza."
          : "El flujo muestra ambiguedad cuando intenta seguir a la siguiente pantalla."
      },
      {
        label: "Confianza en la accion principal",
        severity: status === "completed" ? "medium" : "high",
        detail: task.type === "navigation"
          ? "La llamada principal existe, pero no siempre parece suficientemente explicita."
          : "La propuesta genera interes, aunque todavia hay dudas sobre el riesgo y la conveniencia."
      },
      {
        label: "Carga cognitiva",
        severity: rng() > 0.58 ? "medium" : "low",
        detail: "Hay demasiadas decisiones simultaneas para un contexto de uso rapido o cansado."
      }
    ];
  }

  function buildFollowUps(task, status) {
    if (task.type === "idea") {
      return [
        "Quieres que te cuente que parte me resulto mas valiosa?",
        "Te interesa mas entender que me genera confianza o que me haria dudar?"
      ];
    }
    return status === "abandoned" || status === "error"
      ? [
          "Quieres que te explique el punto exacto donde dejaria el flujo?",
          "Te interesa que detalle por que no senti suficiente certeza para seguir?"
        ]
      : [
          "Quieres que te cuente que parte del flujo me parecio mas clara?",
          "Te interesa revisar donde senti mas esfuerzo aunque pude completar la tarea?"
        ];
  }

  function buildPredictedPoints(rng) {
    return Array.from({ length: 8 }, (_, index) => ({
      x: 70 + Math.round(rng() * 220),
      y: 110 + Math.round(rng() * 360),
      step: index + 1,
      screen: "Predictive",
      certainty: 60 + Math.round(rng() * 30),
      weight: 0.2 + rng() * 0.6
    }));
  }

  function buildPredictiveNotes(task, persona) {
    return [
      `Prediccion de atencion inicial ajustada al contexto de ${persona.segment || "uso"} y al task ${task.type}.`,
      "Las zonas de mayor saliencia se muestran como una capa estimada y no como comportamiento observado.",
      "Util para comparar expectativas visuales con los clicks reales del run."
    ];
  }

  function buildScreenSvg(screen, task, persona, index) {
    const accent = ["#ff6f3c", "#0f8b8d", "#6f8f3f", "#d1481f"][index % 4];
    const subtitle = task.type === "navigation" ? getHostLabel(task.url || "figma.com") : persona.name;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="360" height="640">
        <rect width="360" height="640" rx="28" fill="#fdf8f1" />
        <rect x="24" y="26" width="312" height="64" rx="18" fill="${accent}" opacity="0.16" />
        <rect x="24" y="112" width="312" height="120" rx="22" fill="#ffffff" stroke="rgba(0,0,0,0.08)" />
        <rect x="24" y="254" width="150" height="144" rx="20" fill="#ffffff" stroke="rgba(0,0,0,0.08)" />
        <rect x="186" y="254" width="150" height="144" rx="20" fill="#ffffff" stroke="rgba(0,0,0,0.08)" />
        <rect x="24" y="420" width="312" height="74" rx="22" fill="${accent}" opacity="0.18" />
        <text x="32" y="58" fill="#191919" font-family="Avenir Next, sans-serif" font-size="16" font-weight="700">${escapeXml(screen)}</text>
        <text x="32" y="78" fill="#5d5548" font-family="Avenir Next, sans-serif" font-size="12">${escapeXml(subtitle)}</text>
        <text x="38" y="150" fill="#191919" font-family="Avenir Next, sans-serif" font-size="14">Synthetic screenshot</text>
        <text x="38" y="172" fill="#5d5548" font-family="Avenir Next, sans-serif" font-size="12">Observed artifact generated locally</text>
      </svg>
    `;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function loadScreenshot(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function drawBackground(ctx, canvas, img, title) {
    if (img) {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      drawVisualChrome(ctx, title);
    }
  }

  function drawVisualChrome(ctx, title) {
    ctx.clearRect(0, 0, 360, 640);
    ctx.fillStyle = "#fdf8f1";
    ctx.fillRect(0, 0, 360, 640);
    ctx.fillStyle = "rgba(255,111,60,0.12)";
    roundRect(ctx, 22, 24, 316, 72, 20);
    ctx.fill();
    ctx.fillStyle = "#191919";
    ctx.font = "700 18px Avenir Next";
    ctx.fillText(title, 36, 66);
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    roundRect(ctx, 22, 114, 316, 126, 24);
    ctx.fill();
    roundRect(ctx, 22, 266, 148, 136, 22);
    ctx.fill();
    roundRect(ctx, 190, 266, 148, 136, 22);
    ctx.fill();
    ctx.fillStyle = "rgba(15,139,141,0.1)";
    roundRect(ctx, 22, 426, 316, 86, 24);
    ctx.fill();
  }

  function drawHeatPoints(ctx, points, predictive) {
    (points || []).forEach((point) => {
      const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, predictive ? 80 : 60);
      gradient.addColorStop(0, predictive ? "rgba(15,139,141,0.42)" : "rgba(255,111,60,0.45)");
      gradient.addColorStop(0.45, predictive ? "rgba(15,139,141,0.16)" : "rgba(255,111,60,0.18)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(point.x, point.y, predictive ? 78 : 58, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawScanPoints(ctx, points) {
    if (!points || !points.length) {
      return;
    }
    ctx.strokeStyle = "rgba(15,139,141,0.86)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.stroke();
    points.forEach((point, index) => {
      ctx.fillStyle = "#0f8b8d";
      ctx.beginPath();
      ctx.arc(point.x, point.y, 10 + Math.max(2, Math.round((point.weight || 0.3) * 4)), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "700 11px Avenir Next";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(index + 1), point.x, point.y);
    });
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function getPersonaById(id) {
    return state.personas.find((item) => item.id === id) || null;
  }

  function getProjectById(id) {
    return (state.projects || []).find((item) => item.id === id) || null;
  }

  function requiresProject(section) {
    return ["personas", "tasks", "runs", "calibration"].includes(section);
  }

  function mostActiveProjectLabel() {
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

  function getTaskById(id) {
    return state.tasks.find((item) => item.id === id) || null;
  }

  function getRunById(id) {
    return state.runs.find((item) => item.id === id) || null;
  }

  function formatTaskLabel(task) {
    return `${task.type} · ${task.prompt.slice(0, 48)}`;
  }

  function labelDigitalLevel(level) {
    return level === "high" ? "Nivel alto" : level === "low" ? "Nivel bajo" : "Nivel intermedio";
  }

  function metricValue(value) {
    return Number.isFinite(value) ? value : 0;
  }

  function statusClass(status) {
    if (status === "completed") return "completed";
    if (status === "abandoned") return "abandoned";
    if (status === "error") return "error";
    return "uncertain";
  }

  function severityToClass(severity) {
    return severity === "critical" ? "abandoned" : severity === "high" ? "uncertain" : "completed";
  }

  function emptyStateMarkup(copy) {
    return `<div class="empty-state">${copy}</div>`;
  }

  function formatShortDate(dateString) {
    return new Date(dateString).toLocaleDateString("es-CL", { month: "short", day: "numeric" });
  }

  function getHostLabel(url) {
    try {
      return new URL(url).hostname.replace("www.", "");
    } catch (error) {
      return "figma prototype";
    }
  }

  function value(formData, key) {
    return String(formData.get(key) || "").trim();
  }

  function uid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(input) {
    let hash = 1779033703;
    for (let index = 0; index < input.length; index += 1) {
      hash = Math.imul(hash ^ input.charCodeAt(index), 3432918353);
      hash = (hash << 13) | (hash >>> 19);
    }
    return Math.abs(hash);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeXml(value) {
    return escapeHtml(value);
  }
})();
