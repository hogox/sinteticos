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

export function alertError({ title, body, issues = [] }) {
  const modal = document.getElementById("error-modal");
  document.getElementById("error-modal-title").textContent = title;
  document.getElementById("error-modal-body").textContent = body;
  const list = document.getElementById("error-modal-list");
  if (issues.length > 0) {
    list.innerHTML = issues.map((i) => `<li>${i}</li>`).join("");
    list.classList.remove("hidden");
  } else {
    list.innerHTML = "";
    list.classList.add("hidden");
  }
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

export function closeErrorModal() {
  const modal = document.getElementById("error-modal");
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
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
