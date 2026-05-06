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
  if (!form) return;
  form.reset();
  const preview = document.getElementById("upload-file-preview");
  if (preview) preview.innerHTML = "";
  const validation = document.getElementById("upload-url-validation");
  if (validation) validation.innerHTML = "";
  const summary = document.getElementById("upload-summary");
  if (summary) {
    summary.innerHTML = "";
    summary.classList.remove("is-warning");
  }
  setUploadTab("files");
}

const MAX_TOTAL_BYTES = 5 * 1024 * 1024;

const UPLOAD_TAB_SECTIONS = ["files", "urls", "paste"];

export function setUploadTab(tab) {
  if (!UPLOAD_TAB_SECTIONS.includes(tab)) return;
  document.querySelectorAll("[data-upload-tab]").forEach((btn) => {
    const isActive = btn.dataset.uploadTab === tab;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  document.querySelectorAll("[data-upload-section]").forEach((section) => {
    section.classList.toggle("hidden", section.dataset.uploadSection !== tab);
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function detectKindByName(filename) {
  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".pdf")) return "PDF";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) return "Excel";
  if (lower.endsWith(".csv")) return "CSV";
  if (lower.endsWith(".md")) return "Markdown";
  if (lower.endsWith(".txt")) return "Texto";
  return "Archivo";
}

export function renderFilePreview() {
  const input = document.querySelector('#persona-upload-form input[name="files"]');
  const preview = document.getElementById("upload-file-preview");
  if (!input || !preview) return;
  const files = Array.from(input.files || []);
  if (!files.length) {
    preview.innerHTML = "";
    updateUploadSummary();
    return;
  }
  preview.innerHTML = files
    .map(
      (file, idx) => `
      <div class="upload-file-item" data-file-index="${idx}">
        <div class="upload-file-item__main">
          <span class="upload-file-item__kind">${detectKindByName(file.name)}</span>
          <strong class="upload-file-item__name">${escapeHtml(file.name)}</strong>
        </div>
        <span class="upload-file-item__size">${formatBytes(file.size)}</span>
      </div>
    `
    )
    .join("");
  updateUploadSummary();
}

export function updateUploadSummary() {
  const summary = document.getElementById("upload-summary");
  if (!summary) return;
  const form = document.getElementById("persona-upload-form");
  if (!form) return;

  const fileInput = form.elements.namedItem("files");
  const files = fileInput && fileInput.files ? Array.from(fileInput.files) : [];
  const totalFileBytes = files.reduce((sum, f) => sum + f.size, 0);

  const urlsField = form.elements.namedItem("urls");
  const urls = urlsField
    ? String(urlsField.value || "")
        .split(/\r?\n/)
        .map((u) => u.trim())
        .filter(Boolean)
    : [];

  const pastedField = form.elements.namedItem("pasted_text");
  const pastedBytes = pastedField ? new Blob([String(pastedField.value || "")]).size : 0;

  const totalBytes = totalFileBytes + pastedBytes; // URLs no cuentan al límite local (se traen en server)
  const exceeded = totalBytes > MAX_TOTAL_BYTES;

  const parts = [];
  if (files.length) parts.push(`${files.length} archivo(s)`);
  if (urls.length) parts.push(`${urls.length} URL(s)`);
  if (pastedBytes) parts.push(`${formatBytes(pastedBytes)} pegado`);
  const sizeLine = `Tamaño local: <strong>${formatBytes(totalBytes)}</strong> / ${formatBytes(MAX_TOTAL_BYTES)}`;

  if (!parts.length) {
    summary.innerHTML = "";
    summary.classList.remove("is-warning");
    return;
  }
  summary.classList.toggle("is-warning", exceeded);
  summary.innerHTML = `
    <div class="upload-summary__row">${parts.join(" · ")}</div>
    <div class="upload-summary__row">${sizeLine}${exceeded ? " — excede el límite" : ""}</div>
  `;
}

export async function validateUrls() {
  const form = document.getElementById("persona-upload-form");
  const out = document.getElementById("upload-url-validation");
  if (!form || !out) return;
  const urlsField = form.elements.namedItem("urls");
  const urls = urlsField
    ? String(urlsField.value || "")
        .split(/\r?\n/)
        .map((u) => u.trim())
        .filter(Boolean)
    : [];
  if (!urls.length) {
    out.innerHTML = `<p class="upload-urls-hint">Pega URLs en la textarea para validar.</p>`;
    return;
  }
  out.innerHTML = urls
    .map(
      (u) =>
        `<div class="upload-url-item is-pending" data-url="${escapeHtml(u)}"><span class="upload-url-item__status">⏳</span><code>${escapeHtml(u)}</code></div>`
    )
    .join("");

  // Validación quick: HEAD desde el server vía endpoint dedicado, o fetch no-cors básico desde browser.
  // Como no hay endpoint de validación, hacemos un best-effort fetch desde browser (funciona si CORS permite).
  await Promise.all(
    urls.map(async (u) => {
      const node = out.querySelector(`[data-url="${cssEscape(u)}"]`);
      if (!node) return;
      try {
        new URL(u); // valida formato primero
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
          const resp = await fetch(u, { method: "HEAD", mode: "no-cors", signal: controller.signal });
          clearTimeout(timer);
          // En no-cors, resp.status suele ser 0 pero no lanza; si llegamos acá, es alcanzable.
          node.classList.remove("is-pending");
          node.classList.add("is-success");
          node.querySelector(".upload-url-item__status").textContent = "✓";
        } catch (_) {
          clearTimeout(timer);
          node.classList.remove("is-pending");
          node.classList.add("is-warning");
          node.querySelector(".upload-url-item__status").textContent = "?";
          // marcamos como warning porque el server podría poder tracker aunque el browser no.
        }
      } catch (error) {
        node.classList.remove("is-pending");
        node.classList.add("is-error");
        node.querySelector(".upload-url-item__status").textContent = "✗";
      }
    })
  );
}

function cssEscape(str) {
  if (window.CSS && window.CSS.escape) return window.CSS.escape(str);
  return String(str).replace(/(["\\])/g, "\\$1");
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
  const files = fileInput && fileInput.files ? Array.from(fileInput.files) : [];
  const urlsField = form.elements.namedItem("urls");
  const urls = urlsField
    ? String(urlsField.value || "")
        .split(/\r?\n/)
        .map((u) => u.trim())
        .filter(Boolean)
    : [];

  if (!files.length && !urls.length && !pasted) {
    alertError({
      title: "Sin datos fuente",
      body: "Agrega archivos (PDF, Excel, texto), pega URLs o texto antes de extraer personas."
    });
    return;
  }

  // Validación local de tamaño antes de enviar (los URLs no cuentan, los trae el server)
  const totalLocalBytes = files.reduce((s, f) => s + f.size, 0) + new Blob([pasted]).size;
  if (totalLocalBytes > MAX_TOTAL_BYTES) {
    alertError({
      title: "Demasiados datos",
      body: `El total combinado (${formatBytes(totalLocalBytes)}) excede el límite de ${formatBytes(MAX_TOTAL_BYTES)}. Quita algún archivo o reduce el texto pegado.`
    });
    return;
  }

  setBusy("persona-upload-form", true, "Procesando fuentes…");
  try {
    const result = await api.aiExtractPersonasMulti({ files, urls, text: pasted, quantity });
    const failedSources = (result.sources || []).filter((s) => !s.ok);
    if (failedSources.length) {
      // No fallamos el flujo: solo mostramos warning con las fallas en la consola
      console.warn("[persona-upload] Fuentes con error:", failedSources);
    }
    if (!result.personas.length) {
      alertError({
        title: "Sin resultados",
        body: failedSources.length
          ? `El modelo no encontró personas. ${failedSources.length} fuente(s) fallaron al procesarse: ${failedSources.map((f) => `${f.source} (${f.error})`).join("; ")}`
          : "El modelo no encontró personas distinguibles en los datos."
      });
      return;
    }
    openPersonaPreview(result.personas, "upload", { sources: result.sources, stats: result.stats });
  } catch (error) {
    if (error.sources) {
      console.warn("[persona-upload] Sources from failed request:", error.sources);
    }
    handleAiError(error);
  } finally {
    setBusy("persona-upload-form", false);
  }
}

function openPersonaPreview(personas, sourceMode, extras = {}) {
  const ui = getUi();
  ui.personaPreview = {
    sourceMode,
    sources: Array.isArray(extras.sources) ? extras.sources : [],
    stats: extras.stats || null,
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

  // Render sources summary if available (multi-source upload)
  const summaryHost = document.getElementById("persona-preview-body");
  if (summaryHost && ui.personaPreview.sources && ui.personaPreview.sources.length) {
    const stats = ui.personaPreview.stats || {};
    const ok = ui.personaPreview.sources.filter((s) => s.ok);
    const failed = ui.personaPreview.sources.filter((s) => !s.ok);
    summaryHost.innerHTML = `
      <strong>${ui.personaPreview.items.length}</strong> persona(s) extraída(s) de
      <strong>${ok.length}</strong> fuente(s)${failed.length ? ` · <span class="upload-source-failed">${failed.length} con error</span>` : ""}.
      ${stats.chars ? `<span class="upload-source-chars">${(stats.chars / 1024).toFixed(1)} KB de texto procesado.</span>` : ""}
      <details class="upload-source-detail">
        <summary>Ver fuentes</summary>
        <ul class="upload-source-list">
          ${ui.personaPreview.sources
            .map((s) => {
              const icon = s.ok ? "✓" : "✗";
              const cls = s.ok ? "is-ok" : "is-error";
              const meta = s.meta
                ? Object.entries(s.meta)
                    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
                    .join(", ")
                : "";
              return `<li class="${cls}"><span>${icon}</span> <code>${escapeHtml(s.kind)}</code> · ${escapeHtml(s.source)}${meta ? ` <em>(${escapeHtml(meta)})</em>` : ""}${s.error ? ` — <span class="upload-source-error">${escapeHtml(s.error)}</span>` : ""}</li>`;
            })
            .join("")}
        </ul>
      </details>
    `;
  } else if (summaryHost) {
    summaryHost.textContent = "Revisa cada persona, descarta las que no quieras y confirma para guardarlas.";
  }

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

export function bindPersonaUploadEvents() {
  const form = document.getElementById("persona-upload-form");
  if (!form) return;

  // Tabs (Archivos / URLs / Pegado)
  form.addEventListener("click", (event) => {
    const tabBtn = event.target.closest("[data-upload-tab]");
    if (tabBtn) {
      event.preventDefault();
      setUploadTab(tabBtn.dataset.uploadTab);
      return;
    }
    if (event.target.id === "validate-urls-btn") {
      event.preventDefault();
      validateUrls();
    }
  });

  // File input → preview + summary
  const fileInput = form.elements.namedItem("files");
  if (fileInput) {
    fileInput.addEventListener("change", () => {
      renderFilePreview();
    });
  }

  // Cualquier input recalcula el summary
  form.addEventListener("input", (event) => {
    if (event.target && (event.target.name === "urls" || event.target.name === "pasted_text")) {
      updateUploadSummary();
    }
  });
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

async function handlePreviewEdit(id) {
  const ui = getUi();
  if (!ui.personaPreview) return;
  const item = ui.personaPreview.items.find((it) => it.id === id);
  if (!item) return;
  setPersonaCreateMode("advanced");
  fillPersonaForm(item.persona);
  const titleEl = document.getElementById("persona-form-title");
  if (titleEl) titleEl.textContent = "Crear persona desde propuesta IA";
  ui.editingPersonaId = null;
  item.accepted = false;
  renderPersonaPreview();
  closePersonaPreview();
  const { openPersonaModal } = await import("./persona-modal.js");
  openPersonaModal();
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
