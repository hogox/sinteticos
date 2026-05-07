import {
  onProjectSubmit,
  onPersonaSubmit,
  onTaskSubmit,
  onRunSubmit,
  onCalibrationSubmit,
  onPersonaChatSubmit,
  handleProjectAction,
  handlePersonaAction,
  handlePersonaDetailAction,
  handleTaskAction,
  handleRunAction
} from "./handlers.js";
import { getUi, getState, setState, setSkillsCache, getSkillsCache } from "./store.js";
import { render } from "./render.js";
import { renderChatDrawer } from "./render-chat-drawer.js";
import { renderRuns, renderTasks } from "./render-entities.js";
import { renderSkillsSection } from "./render-skills-drawer.js";
import { api } from "./api.js";
import { renderDashboard } from "./render-dashboard.js";
import { resetProjectForm, resetPersonaForm, resetTaskForm } from "./forms.js";
import { closeConfirmation, closeErrorModal } from "./confirmation.js";
import { ensureSelection } from "./state-ops.js";
import { exportState, resetDemoData } from "./export.js";
import {
  setPersonaCreateMode,
  onPersonaSimpleSubmit,
  onPersonaUploadSubmit,
  resetSimpleForm,
  resetUploadForm,
  bindPersonaPreviewEvents,
  bindPersonaUploadEvents
} from "./persona-modes.js";
import { openPersonaModal, closePersonaModal } from "./persona-modal.js";
import { openProjectModal, closeProjectModal } from "./project-modal.js";
import { openTaskModal, closeTaskModal } from "./task-modal.js";

export function bindEvents() {
  document.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("submit", onDynamicSubmit);
  document.addEventListener("focusout", (event) => {
    const commentInput = event.target.closest("[data-comment-run]");
    if (commentInput) {
      submitRunFeedback(commentInput.dataset.commentRun, { comment: commentInput.value });
    }
  });
  document.getElementById("project-form").addEventListener("submit", onProjectSubmit);
  document.getElementById("persona-form").addEventListener("submit", onPersonaSubmit);
  document.getElementById("task-form").addEventListener("submit", onTaskSubmit);
  const unlimitedSteps = document.getElementById("task-unlimited-steps");
  const maxStepsField = document.getElementById("max-steps-field");
  if (unlimitedSteps && maxStepsField) {
    const sync = () => { maxStepsField.style.display = unlimitedSteps.checked ? "none" : ""; };
    unlimitedSteps.addEventListener("change", sync);
    sync();
  }
  document.getElementById("run-form").addEventListener("submit", onRunSubmit);
  document.getElementById("calibration-form").addEventListener("submit", onCalibrationSubmit);
  document.getElementById("create-project-btn").addEventListener("click", openProjectModal);
  const homeCreateProject = document.getElementById("home-create-project-btn");
  if (homeCreateProject) homeCreateProject.addEventListener("click", openProjectModal);
  const homeCreatePersona = document.getElementById("home-create-persona-btn");
  if (homeCreatePersona) homeCreatePersona.addEventListener("click", openPersonaModal);
  const brandLink = document.getElementById("sidebar-brand-link");
  if (brandLink) {
    brandLink.addEventListener("click", () => {
      const ui = getUi();
      ui.section = "home";
      ui.selectedProjectId = null;
      ui.personaDetailId = null;
      render();
    });
  }
  document.getElementById("project-modal-close").addEventListener("click", closeProjectModal);
  document.getElementById("project-modal").addEventListener("click", (event) => {
    if (event.target.id === "project-modal") closeProjectModal();
  });
  document.getElementById("project-reset").addEventListener("click", resetProjectForm);
  document.getElementById("create-persona-btn").addEventListener("click", openPersonaModal);
  document.getElementById("persona-modal-close").addEventListener("click", closePersonaModal);
  document.getElementById("persona-modal").addEventListener("click", (event) => {
    if (event.target.id === "persona-modal") closePersonaModal();
  });
  document.getElementById("persona-reset").addEventListener("click", resetPersonaForm);
  document.getElementById("persona-simple-form").addEventListener("submit", onPersonaSimpleSubmit);
  document.getElementById("persona-upload-form").addEventListener("submit", onPersonaUploadSubmit);
  document.getElementById("persona-simple-reset").addEventListener("click", resetSimpleForm);
  document.getElementById("persona-upload-reset").addEventListener("click", resetUploadForm);
  bindPersonaPreviewEvents();
  bindPersonaUploadEvents();
  document.getElementById("create-task-btn").addEventListener("click", openTaskModal);
  document.getElementById("task-modal-close").addEventListener("click", closeTaskModal);
  document.getElementById("task-modal").addEventListener("click", (event) => {
    if (event.target.id === "task-modal") closeTaskModal();
  });
  document.getElementById("task-reset").addEventListener("click", resetTaskForm);
  document.getElementById("seed-demo").addEventListener("click", resetDemoData);
  document.getElementById("export-state").addEventListener("click", exportState);
  document.getElementById("chat-drawer-close").addEventListener("click", closeChatDrawer);
  const lightboxClose = document.getElementById("image-lightbox-close");
  if (lightboxClose) lightboxClose.addEventListener("click", closeLightbox);
  const lightbox = document.getElementById("image-lightbox");
  if (lightbox) lightbox.addEventListener("click", (event) => {
    if (event.target.id === "image-lightbox") closeLightbox();
  });
  document.getElementById("dashboard-filters").addEventListener("change", onFilterChange);
  document.getElementById("confirm-modal-cancel").addEventListener("click", () => closeConfirmation(false));
  document.getElementById("confirm-modal-confirm").addEventListener("click", () => closeConfirmation(true));
  document.getElementById("confirm-modal").addEventListener("click", (event) => {
    if (event.target.id === "confirm-modal") closeConfirmation(false);
  });
  document.getElementById("error-modal-close").addEventListener("click", closeErrorModal);
  document.getElementById("error-modal").addEventListener("click", (event) => {
    if (event.target.id === "error-modal") closeErrorModal();
  });
  window.addEventListener("keydown", (event) => {
    const ui = getUi();
    if (event.key === "Escape") {
      if (ui.lightboxSrc) { closeLightbox(); return; }
      if (ui.chatDrawer?.open) { closeChatDrawer(); return; }
      const taskModal = document.getElementById("task-modal");
      if (taskModal && !taskModal.classList.contains("hidden")) { closeTaskModal(); return; }
      const projectModal = document.getElementById("project-modal");
      if (projectModal && !projectModal.classList.contains("hidden")) { closeProjectModal(); return; }
      const personaModal = document.getElementById("persona-modal");
      if (personaModal && !personaModal.classList.contains("hidden")) { closePersonaModal(); return; }
      if (ui.confirmation) closeConfirmation(false);
      else closeErrorModal();
    }
  });
}

function openChatDrawer(personaId, mode = "chat") {
  const ui = getUi();
  ui.chatDrawer = { open: true, personaId, conversationId: null, mode };
  // En modo hipótesis empezamos con conversación libre, sin run anclado.
  if (mode === "hypothesis") {
    ui.personaChatMode = "free";
    ui.personaChatAnchorRunId = "";
    ui.selectedConversationId = null;
  }
  renderChatDrawer();
}

function closeChatDrawer() {
  const ui = getUi();
  ui.chatDrawer = { ...ui.chatDrawer, open: false };
  renderChatDrawer();
}

function openLightboxFromSrc(src) {
  const ui = getUi();
  ui.lightboxSrc = src;
  const overlay = document.getElementById("image-lightbox");
  const img = document.getElementById("image-lightbox-img");
  if (!overlay || !img) return;
  img.src = src;
  overlay.classList.remove("hidden");
  overlay.classList.add("is-open");
  overlay.setAttribute("aria-hidden", "false");
}

function closeLightbox() {
  const ui = getUi();
  ui.lightboxSrc = null;
  const overlay = document.getElementById("image-lightbox");
  if (!overlay) return;
  overlay.classList.add("hidden");
  overlay.classList.remove("is-open");
  overlay.setAttribute("aria-hidden", "true");
}

function onDynamicSubmit(event) {
  if (event.target.id === "persona-chat-form") {
    onPersonaChatSubmit(event);
  }
}

async function handleSkillAnalyze() {
  const ui = getUi();
  const picker = document.getElementById("skill-picker");
  const providerPicker = document.getElementById("skill-provider-picker");
  if (!picker || !ui.selectedRunId) return;
  const skillName = picker.value;
  const provider = providerPicker?.value || undefined;
  setSkillsCache({ analyzing: true });
  renderRuns();
  try {
    const result = await api.runSkill(skillName, { runIds: [ui.selectedRunId], provider });
    setSkillsCache({ lastResult: result, lastRunId: ui.selectedRunId, lastSkill: skillName });
  } catch (error) {
    setSkillsCache({ lastResult: { ok: false, error: error.message }, lastRunId: ui.selectedRunId });
  }
  setSkillsCache({ analyzing: false });
  renderRuns();
}

async function handleSkillAnalyzeBatch() {
  const ui = getUi();
  const state = getState();
  const picker = document.getElementById("skill-batch-picker");
  const providerPicker = document.getElementById("skill-batch-provider-picker");
  if (!picker || !ui.selectedProjectId) return;
  const skillName = picker.value;
  const provider = providerPicker?.value || undefined;
  const projectRuns = state.runs.filter((r) => r.project_id === ui.selectedProjectId);
  if (!projectRuns.length) return;
  setSkillsCache({ analyzing: true });
  renderRuns();
  try {
    const result = await api.runSkill(skillName, { runIds: projectRuns.map((r) => r.id), provider });
    setSkillsCache({ lastResult: result, lastRunId: "batch", lastSkill: skillName });
  } catch (error) {
    setSkillsCache({ lastResult: { ok: false, error: error.message }, lastRunId: "batch" });
  }
  setSkillsCache({ analyzing: false });
  renderRuns();
}

async function handleLighthouseAnalyze() {
  const ui = getUi();
  if (!ui.selectedRunId) return;
  const providerPicker = document.getElementById("lh-provider-picker");
  const provider = providerPicker?.value || undefined;
  setSkillsCache({ lhAnalyzing: true });
  renderRuns();
  try {
    const result = await api.runSkill("lighthouse-analyst", { runIds: [ui.selectedRunId], provider });
    setSkillsCache({ lhResult: result, lhRunId: ui.selectedRunId });
  } catch (error) {
    setSkillsCache({ lhResult: { ok: false, error: error.message }, lhRunId: ui.selectedRunId });
  }
  setSkillsCache({ lhAnalyzing: false });
  renderRuns();
}

function handleLighthouseToggleView() {
  const cache = getSkillsCache();
  setSkillsCache({ lhView: cache.lhView === "summary" ? "detail" : "summary" });
  renderRuns();
}

export function onClick(event) {
  const ui = getUi();

  const zoomImg = event.target.closest("[data-zoom-src]");
  if (zoomImg) {
    openLightboxFromSrc(zoomImg.dataset.zoomSrc);
    return;
  }

  const zoomCanvas = event.target.closest("[data-zoom-canvas]");
  if (zoomCanvas && zoomCanvas.tagName === "CANVAS") {
    try {
      openLightboxFromSrc(zoomCanvas.toDataURL());
    } catch (_) {}
    return;
  }

  const skillsTab = event.target.closest("[data-skills-tab]");
  if (skillsTab) {
    ui.skillsDrawer = { ...(ui.skillsDrawer || {}), tab: skillsTab.dataset.skillsTab };
    renderSkillsSection();
    return;
  }

  const rateStar = event.target.closest("[data-rate-run]");
  if (rateStar) {
    const runId = rateStar.dataset.rateRun;
    const rating = Number(rateStar.dataset.rating);
    submitRunFeedback(runId, { rating });
    return;
  }

  const tagBtn = event.target.closest("[data-toggle-tag]");
  if (tagBtn) {
    const runId = tagBtn.dataset.toggleTag;
    const tag = tagBtn.dataset.tag;
    const state = getState();
    const run = (state.runs || []).find((r) => r.id === runId);
    const currentTags = run?.feedback?.tags || [];
    const nextTags = currentTags.includes(tag) ? currentTags.filter((t) => t !== tag) : [...currentTags, tag];
    submitRunFeedback(runId, { tags: nextTags });
    return;
  }

  const analysisBtn = event.target.closest("[data-rate-analysis]");
  if (analysisBtn) {
    const analysisId = analysisBtn.dataset.rateAnalysis;
    const partial = {};
    if (analysisBtn.dataset.helpful) partial.helpful = analysisBtn.dataset.helpful === "true";
    if (analysisBtn.dataset.accuracy) partial.accuracy = Number(analysisBtn.dataset.accuracy);
    if (analysisBtn.dataset.surprise) partial.surprised_me = analysisBtn.checked;
    submitAnalysisFeedback(analysisId, partial);
    return;
  }

  const openChatBtn = event.target.closest("[data-action='open-chat']");
  if (openChatBtn) {
    openChatDrawer(openChatBtn.dataset.personaId);
    return;
  }

  const openHypothesisBtn = event.target.closest("[data-action='open-hypothesis']");
  if (openHypothesisBtn) {
    openChatDrawer(openHypothesisBtn.dataset.personaId, "hypothesis");
    return;
  }

  const homePersona = event.target.closest("[data-home-persona-id]");
  if (homePersona) {
    ui.personaDetailId = homePersona.dataset.homePersonaId;
    ui.selectedPersonaId = homePersona.dataset.homePersonaId;
    ui.section = "persona-detail";
    render();
    return;
  }

  const homeProject = event.target.closest("[data-home-project-id]");
  if (homeProject) {
    ui.selectedProjectId = homeProject.dataset.homeProjectId;
    ui.filters.personaId = "all";
    ui.filters.taskId = "all";
    ui.filters.status = "all";
    ui.section = "dashboard";
    ensureSelection();
    render();
    return;
  }

  const lhAction = event.target.closest("[data-lighthouse-action]");
  if (lhAction) {
    const action = lhAction.dataset.lighthouseAction;
    if (action === "analyze") handleLighthouseAnalyze();
    else if (action === "toggle-view") handleLighthouseToggleView();
    return;
  }

  const skillAction = event.target.closest("[data-skill-action]");
  if (skillAction) {
    const action = skillAction.dataset.skillAction;
    if (action === "analyze") handleSkillAnalyze();
    else if (action === "analyze-batch") handleSkillAnalyzeBatch();
    return;
  }

  const navTab = event.target.closest(".nav-tab");
  if (navTab) {
    if (navTab.classList.contains("is-disabled")) {
      return;
    }
    const section = navTab.dataset.section;
    // Personas tab y Policy: limpian la selección de proyecto.
    if (section === "personas" || section === "policy") {
      ui.selectedProjectId = null;
      ui.filters.personaId = "all";
      ui.filters.taskId = "all";
      ui.filters.status = "all";
    }
    if (section === "personas") {
      ui.personaDetailId = null;
    }
    // Click en Projects: si hay un proyecto activo, ir a su dashboard. Si no, lista de proyectos.
    if (section === "projects" && ui.selectedProjectId) {
      ui.section = "dashboard";
    } else {
      if (section === "projects") {
        ui.selectedProjectId = null;
        ui.filters.personaId = "all";
        ui.filters.taskId = "all";
        ui.filters.status = "all";
      }
      ui.section = section;
    }
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

  const personaTab = event.target.closest("[data-persona-tab]");
  if (personaTab) {
    ui.personaDetailTab = personaTab.dataset.personaTab;
    render();
    return;
  }

  const evolveBtn = event.target.closest("[data-evolve-persona]");
  if (evolveBtn) {
    handlePersonaEvolve(evolveBtn.dataset.evolvePersona);
    return;
  }

  const tuneBtn = event.target.closest("[data-tune-prompt]");
  if (tuneBtn) {
    handlePromptTune(tuneBtn.dataset.tunePrompt);
    return;
  }

  const copyEditBtn = event.target.closest("[data-copy-tuner-edit]");
  if (copyEditBtn) {
    const idx = Number(copyEditBtn.dataset.copyTunerEdit);
    const cache = getSkillsCache();
    const edits = cache.tunerResult?.output?.proposed_edits || [];
    const edit = edits[idx];
    if (edit?.proposed_text) {
      navigator.clipboard.writeText(edit.proposed_text).then(() => {
        copyEditBtn.textContent = "Copiado ✓";
        setTimeout(() => { copyEditBtn.textContent = "Copiar texto propuesto"; }, 1200);
      }).catch(() => {});
    }
    return;
  }

  const applyChangeBtn = event.target.closest("[data-apply-change]");
  if (applyChangeBtn) {
    const personaId = applyChangeBtn.dataset.applyChange;
    const idx = Number(applyChangeBtn.dataset.changeIdx);
    handleApplyEvolveChange(personaId, [idx]);
    return;
  }

  const applyAllBtn = event.target.closest("[data-apply-all-changes]");
  if (applyAllBtn) {
    handleApplyEvolveChange(applyAllBtn.dataset.applyAllChanges, null);
    return;
  }

  const personaDetailAction = event.target.closest("[data-persona-detail-action]");
  if (personaDetailAction) {
    handlePersonaDetailAction(personaDetailAction.dataset.personaDetailAction, personaDetailAction.dataset.id);
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
    ui.personaDetailId = personaCard.dataset.personaId;
    ui.section = "persona-detail";
    render();
    return;
  }

  const taskCard = event.target.closest("[data-task-id]");
  if (taskCard) {
    ui.selectedTaskId = taskCard.dataset.taskId;
    renderTasks();
    renderDashboard();
    return;
  }

  const detailView = event.target.closest("[data-detail-view]");
  if (detailView) {
    ui.runDetailView = detailView.dataset.detailView;
    renderRuns();
    return;
  }

  const personaModeBtn = event.target.closest("[data-persona-mode]");
  if (personaModeBtn) {
    setPersonaCreateMode(personaModeBtn.dataset.personaMode);
  }
}

async function handlePersonaEvolve(personaId) {
  const state = getState();
  const persona = (state.personas || []).find((p) => p.id === personaId);
  if (!persona) return;
  const personaRuns = (state.runs || []).filter((r) => r.persona_id === personaId);
  if (!personaRuns.length) {
    alert("Esta persona aún no tiene runs para analizar.");
    return;
  }
  setSkillsCache({ evolving: personaId });
  render();
  try {
    const result = await api.runSkill("persona-evolver", {
      runIds: personaRuns.map((r) => r.id),
      persona_id: personaId
    });
    const cache = getSkillsCache();
    setSkillsCache({
      evolving: null,
      evolveByPersona: { ...(cache.evolveByPersona || {}), [personaId]: result }
    });
  } catch (error) {
    const cache = getSkillsCache();
    setSkillsCache({
      evolving: null,
      evolveByPersona: { ...(cache.evolveByPersona || {}), [personaId]: { ok: false, error: error.message } }
    });
  }
  render();
}

async function handlePromptTune(projectId) {
  const state = getState();
  const projectRuns = (state.runs || []).filter((r) => r.project_id === projectId);
  const negativeRuns = projectRuns.filter((r) => {
    const tags = r.feedback?.tags || [];
    const rating = r.feedback?.rating || 0;
    return rating > 0 && rating <= 2 || tags.some((t) => t === "robotico" || t === "no entiende el dominio" || t === "muy optimista" || t === "comportamiento raro");
  });
  if (negativeRuns.length < 5) {
    alert("Necesitás al menos 5 runs con feedback negativo. Hay " + negativeRuns.length + ".");
    return;
  }
  setSkillsCache({ tuning: true });
  renderDashboard();
  try {
    const result = await api.runSkill("prompt-tuner", { runIds: negativeRuns.map((r) => r.id) });
    setSkillsCache({ tuning: false, tunerResult: result });
  } catch (error) {
    setSkillsCache({ tuning: false, tunerResult: { ok: false, error: error.message } });
  }
  renderDashboard();
}

async function handleApplyEvolveChange(personaId, indices) {
  const cache = getSkillsCache();
  const result = cache.evolveByPersona?.[personaId];
  if (!result || !result.ok) return;
  const allChanges = result.output?.proposed_changes || [];
  const toApply = indices ? indices.map((i) => allChanges[i]).filter(Boolean) : allChanges;
  if (!toApply.length) return;
  if (!confirm(`Aplicar ${toApply.length} cambio(s) a la persona? Esto crea una nueva versión.`)) return;

  const state = getState();
  const persona = (state.personas || []).find((p) => p.id === personaId);
  if (!persona) return;

  const updated = { ...persona };
  for (const change of toApply) {
    const field = change.field;
    const op = change.operation;
    const newVal = change.value;
    if (op === "add") {
      const current = updated[field];
      if (Array.isArray(current)) {
        updated[field] = [...current, ...(Array.isArray(newVal) ? newVal : [newVal])];
      } else if (typeof current === "string" && current) {
        updated[field] = `${current} ${Array.isArray(newVal) ? newVal.join(" ") : newVal}`.trim();
      } else {
        updated[field] = newVal;
      }
    } else if (op === "remove") {
      const current = updated[field];
      if (Array.isArray(current) && Array.isArray(newVal)) {
        updated[field] = current.filter((v) => !newVal.includes(v));
      } else {
        updated[field] = "";
      }
    } else if (op === "update") {
      updated[field] = newVal;
    }
  }
  updated.version = (persona.version || 1) + 1;

  try {
    setState(await api.updatePersona(personaId, updated));
    // Clear evolve cache for this persona since it's outdated
    const newCache = { ...(cache.evolveByPersona || {}) };
    delete newCache[personaId];
    setSkillsCache({ evolveByPersona: newCache });
    render();
  } catch (error) {
    console.error("apply evolve failed", error);
    alert("Error aplicando cambios: " + error.message);
  }
}

async function submitAnalysisFeedback(analysisId, partial) {
  const state = getState();
  const existing = (state.run_analyses || []).find((a) => a.id === analysisId);
  const current = existing?.feedback || {};
  const next = {
    helpful: current.helpful ?? null,
    accuracy: current.accuracy ?? null,
    surprised_me: current.surprised_me ?? false,
    comment: current.comment || "",
    ...partial
  };
  try {
    setState(await api.rateAnalysis(analysisId, next));
    // Update the cached lastResult so UI re-renders with new feedback
    const cache = getSkillsCache();
    if (cache.lastResult && cache.lastResult.analysis_id === analysisId) {
      setSkillsCache({ lastResult: { ...cache.lastResult, feedback: next } });
    }
    renderRuns();
  } catch (error) {
    console.error("rateAnalysis failed", error);
  }
}

async function submitRunFeedback(runId, partial) {
  const state = getState();
  const run = (state.runs || []).find((r) => r.id === runId);
  const current = run?.feedback || {};
  const next = { rating: current.rating || null, tags: current.tags || [], comment: current.comment || "", ...partial };
  try {
    setState(await api.rateRun(runId, next));
    renderRuns();
  } catch (error) {
    console.error("rateRun failed", error);
  }
}

export function onFilterChange(event) {
  const ui = getUi();
  const filter = event.target.name;
  if (!filter) {
    return;
  }
  ui.filters[filter] = event.target.value;
  renderDashboard();
}

export function onKeydown(event) {
  if (!["Enter", " "].includes(event.key)) {
    return;
  }
  if (event.target.closest("button, input, textarea, select, summary")) {
    return;
  }
  const personaCard = event.target.closest("[data-persona-id]");
  if (!personaCard) {
    return;
  }
  event.preventDefault();
  const ui = getUi();
  ui.selectedPersonaId = personaCard.dataset.personaId;
  ui.personaDetailId = personaCard.dataset.personaId;
  ui.section = "persona-detail";
  render();
}
