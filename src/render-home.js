import { getState } from "./store.js";
import { escapeHtml, formatShortDate, emptyStateMarkup, labelDigitalLevel } from "./utils.js";

const PROJECT_COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626", "#db2777", "#65a30d"];
const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626", "#db2777", "#65a30d"];

function colorFor(name, palette) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return palette[Math.abs(hash) % palette.length];
}

function initialsOf(name) {
  return String(name || "?")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function personaCardHtml(persona, runCount, conversationCount) {
  const color = colorFor(persona.name || "?", AVATAR_COLORS);
  const initials = initialsOf(persona.name);
  return `
    <article class="persona-card" data-home-persona-id="${persona.id}" role="button" tabindex="0" aria-label="Abrir ficha de ${escapeHtml(persona.name)}">
      <div class="persona-card__top">
        <div class="persona-card__avatar" style="background:${color}">${initials}</div>
        <span class="tag">${escapeHtml(persona.status || "active")}</span>
      </div>
      <div class="persona-card__body">
        <p class="persona-card__name">${escapeHtml(persona.name || "Sin nombre")}</p>
        <p class="persona-card__role">${escapeHtml(persona.segment || "Sin segmento")} · ${escapeHtml(persona.role || "Sin rol")}</p>
        <p class="persona-card__desc">${escapeHtml((persona.description || persona.usage_context || "Sin descripcion").slice(0, 100))}</p>
      </div>
      <div class="persona-card__meta">
        <span class="pill">${labelDigitalLevel(persona.digital_level)}</span>
        <span class="pill">${runCount} runs</span>
        <span class="pill">${conversationCount} chats</span>
      </div>
    </article>
  `;
}

function projectCardHtml(project, personasInRunsCount, taskCount, runCount) {
  const color = colorFor(project.name || "?", PROJECT_COLORS);
  const initials = initialsOf(project.name);
  return `
    <article class="project-card" data-home-project-id="${project.id}" role="button" tabindex="0" aria-label="Abrir proyecto ${escapeHtml(project.name)}">
      <div class="project-card__top">
        <div class="project-card__avatar" style="background:${color}">${initials}</div>
        <div class="project-card__info">
          <p class="project-card__name">${escapeHtml(project.name)}</p>
          <p class="project-card__date">${formatShortDate(project.created_at)}</p>
        </div>
      </div>
      <div class="project-card__body">
        <p class="project-card__desc">${escapeHtml((project.description || "Sin descripcion").slice(0, 120))}</p>
      </div>
      <div class="project-card__meta">
        <span class="pill">${personasInRunsCount} personas</span>
        <span class="pill">${taskCount} tasks</span>
        <span class="pill">${runCount} runs</span>
      </div>
    </article>
  `;
}

export function renderHome() {
  const state = getState();
  const personasList = document.getElementById("home-persona-list");
  const projectsList = document.getElementById("home-project-list");
  if (!personasList || !projectsList) return;

  const personas = (state.personas || []).filter((p) => p.status !== "archived");
  const conversations = state.persona_conversations || [];
  const runs = state.runs || [];
  const tasks = state.tasks || [];
  const projects = state.projects || [];

  personasList.innerHTML = personas.length
    ? personas
        .map((persona) => {
          const runCount = runs.filter((r) => r.persona_id === persona.id).length;
          const chatCount = conversations.filter((c) => c.persona_id === persona.id).length;
          return personaCardHtml(persona, runCount, chatCount);
        })
        .join("")
    : emptyStateMarkup("Aún no creaste personas. Crea una para empezar a explorar hipótesis y proyectos.");

  projectsList.innerHTML = projects.length
    ? projects
        .map((project) => {
          const projectRuns = runs.filter((r) => r.project_id === project.id);
          const projectTasks = tasks.filter((t) => t.project_id === project.id);
          const personaIdsInRuns = new Set(projectRuns.map((r) => r.persona_id));
          return projectCardHtml(project, personaIdsInRuns.size, projectTasks.length, projectRuns.length);
        })
        .join("")
    : emptyStateMarkup("Todavía no hay proyectos. Crea uno para correr a tus personas en flujos concretos.");
}

