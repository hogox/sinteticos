import { getUi } from "./store.js";

export function openPersonaModal() {
  const modal = document.getElementById("persona-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

export function closePersonaModal() {
  const modal = document.getElementById("persona-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  const ui = getUi();
  ui.editingPersonaId = null;
}
