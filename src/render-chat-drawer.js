import { getState, getUi } from "./store.js";
import { getPersonaById } from "./utils.js";
import { renderPersonaChat } from "./render-persona-detail.js";

export function renderChatDrawer() {
  const drawer = document.getElementById("chat-drawer");
  const body = document.getElementById("chat-drawer-body");
  const nameEl = document.getElementById("chat-drawer-name");
  const roleEl = document.getElementById("chat-drawer-role");
  const initialsEl = document.getElementById("chat-drawer-initials");
  if (!drawer) return;

  const ui = getUi();
  const { open, personaId } = ui.chatDrawer;

  drawer.classList.toggle("is-open", open);
  drawer.setAttribute("aria-hidden", String(!open));

  if (!open || !personaId) return;

  const state = getState();
  const persona = getPersonaById(personaId, state);
  if (!persona) return;

  if (nameEl) nameEl.textContent = persona.name;
  if (roleEl) roleEl.textContent = persona.role || "Arquetipo sintético";
  if (initialsEl) initialsEl.textContent = (persona.name || "P").slice(0, 2).toUpperCase();

  const conversations = (state.persona_conversations || [])
    .filter((t) => t.persona_id === personaId)
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));

  if (ui.selectedConversationId && !conversations.some((t) => t.id === ui.selectedConversationId)) {
    ui.selectedConversationId = null;
  }
  if (!ui.selectedConversationId && conversations[0]) {
    ui.selectedConversationId = conversations[0].id;
  }
  const selectedThread = conversations.find((t) => t.id === ui.selectedConversationId) || null;

  const runs = (state.runs || [])
    .filter((r) => r.persona_id === personaId)
    .sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0));

  if (body) {
    body.innerHTML = renderPersonaChat({ conversations, selectedThread, runs, ui });
  }
}
