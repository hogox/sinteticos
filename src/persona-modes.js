import { api } from "./api.js";
import { getUi, getState, setState } from "./store.js";
import { alertError } from "./confirmation.js";
import { fillPersonaForm, resetPersonaForm } from "./forms.js";
import { render } from "./render.js";
import { ensureSelection } from "./state-ops.js";
import { escapeHtml } from "./utils.js";

const MODE_FORM_IDS = {
  advanced: "persona-form",
  simple: "persona-simple-form",
  upload: "persona-upload-form"
};

export function setPersonaCreateMode(mode) {
  const ui = getUi();
  if (!MODE_FORM_IDS[mode]) {
    return;
  }
  ui.personaCreateMode = mode;

  document.querySelectorAll("[data-persona-mode]").forEach((btn) => {
    const isActive = btn.dataset.personaMode === mode;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  Object.entries(MODE_FORM_IDS).forEach(([key, formId]) => {
    const form = document.getElementById(formId);
    if (!form) return;
    form.hidden = key !== mode;
  });
}

export function resetSimpleForm() {
  const form = document.getElementById("persona-simple-form");
  if (form) form.reset();
}

export function resetUploadForm() {
  const form = document.getElementById("persona-upload-form");
  if (form) form.reset();
}

async function readFilesAsText(fileList) {
  const files = Array.from(fileList || []);
  const parts = await Promise.all(
    files.map(
      (file) =>
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(`--- archivo: ${file.name} ---\n${reader.result || ""}`);
          reader.onerror = () => resolve(`--- archivo: ${file.name} (error de lectura) ---`);
          reader.readAsText(file);
        })
    )
  );
  return parts.join("\n\n");
}

function setBusy(formId, busy, busyLabel) {
  const form = document.getElementById(formId);
  if (!form) return;
  Array.from(form.elements).forEach((el) => {
    el.disabled = busy;
  });
  const submit = form.querySelector('button[type="submit"]');
  if (submit) {
    if (busy) {
      submit.dataset.originalLabel = submit.textContent;
      submit.textContent = busyLabel;
    } else if (submit.dataset.originalLabel) {
      submit.textContent = submit.dataset.originalLabel;
      delete submit.dataset.originalLabel;
    }
  }
}

function handleAiError(error) {
  const map = {
    ANTHROPIC_KEY_MISSING: {
      title: "Falta la API key de Anthropic",
      body: "Para usar los modos asistidos por IA, definí la variable de entorno ANTHROPIC_API_KEY antes de iniciar el server."
    },
    NO_BACKEND: {
      title: "Modos asistidos no disponibles",
      body: "Estás en modo browser-only. Los modos Simple y Upload requieren correr el server local con `npm start`."
    },
    INVALID_INPUT: {
      title: "Entrada inválida",
      body: error.message || "Revisá el contenido enviado al modo asistido."
    },
    ANTHROPIC_BAD_RESPONSE: {
      title: "Respuesta inesperada del modelo",
      body: "El modelo no devolvió personas válidas. Intentá nuevamente o ajustá la descripción."
    }
  };
  const fallback = { title: "Error en la generación con IA", body: error.message || "Ocurrió un error inesperado." };
  const info = map[error.code] || fallback;
  alertError(info);
}

export async function onPersonaSimpleSubmit(event) {
  event.preventDefault();
  const ui = getUi();
  if (!ui.selectedProjectId) {
    alertError({ title: "Selecciona un proyecto", body: "Las personas se crean dentro de un proyecto activo." });
    return;
  }
  const formData = new FormData(event.currentTarget);
  const description = String(formData.get("description") || "").trim();
  const quantity = Math.max(1, Math.min(10, Number(formData.get("quantity")) || 1));
  if (!description) {
    alertError({ title: "Descripción vacía", body: "Escribe una descripción libre antes de generar." });
    return;
  }
  setBusy("persona-simple-form", true, "Generando…");
  try {
    const personas = await api.aiGeneratePersonas(description, quantity);
    if (!personas.length) {
      alertError({ title: "Sin resultados", body: "El modelo no devolvió personas. Intentá refinar la descripción." });
      return;
    }
    openPersonaPreview(personas, "simple");
  } catch (error) {
    handleAiError(error);
  } finally {
    setBusy("persona-simple-form", false);
  }
}

export async function onPersonaUploadSubmit(event) {
  event.preventDefault();
  const ui = getUi();
  if (!ui.selectedProjectId) {
    alertError({ title: "Selecciona un proyecto", body: "Las personas se crean dentro de un proyecto activo." });
    return;
  }
  const form = event.currentTarget;
  const formData = new FormData(form);
  const pasted = String(formData.get("pasted_text") || "").trim();
  const quantity = Math.max(1, Math.min(20, Number(formData.get("quantity")) || 1));
  const fileInput = form.elements.namedItem("files");
  const filesText = fileInput && fileInput.files ? await readFilesAsText(fileInput.files) : "";
  const sourceText = [filesText, pasted].filter(Boolean).join("\n\n").trim();
  if (!sourceText) {
    alertError({ title: "Sin datos fuente", body: "Sube archivos o pega texto antes de extraer personas." });
    return;
  }
  setBusy("persona-upload-form", true, "Extrayendo…");
  try {
    const personas = await api.aiExtractPersonas(sourceText, quantity);
    if (!personas.length) {
      alertError({ title: "Sin resultados", body: "El modelo no encontró personas distinguibles en los datos." });
      return;
    }
    openPersonaPreview(personas, "upload");
  } catch (error) {
    handleAiError(error);
  } finally {
    setBusy("persona-upload-form", false);
  }
}

function openPersonaPreview(personas, sourceMode) {
  const ui = getUi();
  ui.personaPreview = {
    sourceMode,
    items: personas.map((p, i) => ({ id: `proposal-${i}`, persona: p, accepted: true }))
  };
  renderPersonaPreview();
  const modal = document.getElementById("persona-preview-modal");
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closePersonaPreview() {
  const ui = getUi();
  ui.personaPreview = null;
  const modal = document.getElementById("persona-preview-modal");
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

function renderPersonaPreview() {
  const ui = getUi();
  const list = document.getElementById("persona-preview-list");
  if (!list || !ui.personaPreview) return;
  const items = ui.personaPreview.items;
  list.innerHTML = items
    .map((item) => {
      const p = item.persona;
      return `
        <article class="persona-preview-card${item.accepted ? "" : " is-discarded"}" data-proposal-id="${item.id}">
          <header class="persona-preview-card__header">
            <div>
              <strong>${escapeHtml(p.name || "Sin nombre")}</strong>
              <p class="persona-preview-card__role">${escapeHtml(p.role || "")} · ${escapeHtml(p.segment || "")}</p>
            </div>
            <label class="persona-preview-card__toggle">
              <input type="checkbox" data-preview-action="toggle" ${item.accepted ? "checked" : ""} />
              <span>${item.accepted ? "Incluir" : "Descartada"}</span>
            </label>
          </header>
          <p class="persona-preview-card__desc">${escapeHtml(p.description || "")}</p>
          <details class="persona-preview-card__details">
            <summary>Ver campos completos</summary>
            <dl>
              ${["goals", "motivations", "needs", "behaviors", "pains", "frictions", "personality_traits", "digital_environment", "digital_behavior", "devices", "digital_level", "apps_used", "restrictions", "attachments"]
                .map((key) => `<dt>${key}</dt><dd>${escapeHtml(p[key] || "—")}</dd>`)
                .join("")}
            </dl>
          </details>
          <div class="persona-preview-card__actions">
            <button type="button" class="ghost-button" data-preview-action="edit">Editar en avanzado</button>
          </div>
        </article>
      `;
    })
    .join("");
}

export function bindPersonaPreviewEvents() {
  const list = document.getElementById("persona-preview-list");
  if (list) {
    list.addEventListener("click", (event) => {
      const editBtn = event.target.closest('[data-preview-action="edit"]');
      if (editBtn) {
        const card = editBtn.closest("[data-proposal-id]");
        if (card) handlePreviewEdit(card.dataset.proposalId);
      }
    });
    list.addEventListener("change", (event) => {
      const toggle = event.target.closest('[data-preview-action="toggle"]');
      if (toggle) {
        const card = toggle.closest("[data-proposal-id]");
        if (card) handlePreviewToggle(card.dataset.proposalId, toggle.checked);
      }
    });
  }

  const cancelBtn = document.getElementById("persona-preview-cancel");
  if (cancelBtn) cancelBtn.addEventListener("click", closePersonaPreview);

  const confirmBtn = document.getElementById("persona-preview-confirm");
  if (confirmBtn) confirmBtn.addEventListener("click", confirmPersonaPreview);

  const backdrop = document.getElementById("persona-preview-modal");
  if (backdrop) {
    backdrop.addEventListener("click", (event) => {
      if (event.target.id === "persona-preview-modal") closePersonaPreview();
    });
  }
}

function handlePreviewToggle(id, accepted) {
  const ui = getUi();
  if (!ui.personaPreview) return;
  const item = ui.personaPreview.items.find((it) => it.id === id);
  if (item) {
    item.accepted = accepted;
    renderPersonaPreview();
  }
}

function handlePreviewEdit(id) {
  const ui = getUi();
  if (!ui.personaPreview) return;
  const item = ui.personaPreview.items.find((it) => it.id === id);
  if (!item) return;
  setPersonaCreateMode("advanced");
  fillPersonaForm(item.persona);
  document.getElementById("persona-form-title").textContent = `Crear persona desde propuesta IA`;
  ui.editingPersonaId = null;
  item.accepted = false;
  renderPersonaPreview();
  closePersonaPreview();
}

async function confirmPersonaPreview() {
  const ui = getUi();
  if (!ui.personaPreview) return;
  const accepted = ui.personaPreview.items.filter((it) => it.accepted);
  if (!accepted.length) {
    alertError({ title: "Nada que guardar", body: "Selecciona al menos una persona o usá Cancelar." });
    return;
  }
  const sourceMode = ui.personaPreview.sourceMode;
  const projectId = ui.selectedProjectId;
  const confirmBtn = document.getElementById("persona-preview-confirm");
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Guardando…";
  }
  try {
    for (const item of accepted) {
      const payload = { ...item.persona, project_id: projectId };
      const nextState = await api.createPersona(payload);
      setState(nextState);
    }
    ensureSelection();
    if (sourceMode === "simple") resetSimpleForm();
    else if (sourceMode === "upload") resetUploadForm();
    closePersonaPreview();
    render();
  } catch (error) {
    alertError({ title: "Error al guardar", body: error.message || "No fue posible persistir todas las personas." });
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Guardar seleccionadas";
    }
  }
}
