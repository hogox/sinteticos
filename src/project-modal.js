import { getUi } from "./store.js";

export function openProjectModal() {
  const modal = document.getElementById("project-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

export function closeProjectModal() {
  const modal = document.getElementById("project-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  const ui = getUi();
  ui.editingProjectId = null;
}
