import { getUi } from "./store.js";

export function confirmAction({ title, body, confirmLabel = "Confirmar" }) {
  const ui = getUi();
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

export function closeConfirmation(confirmed) {
  const ui = getUi();
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
