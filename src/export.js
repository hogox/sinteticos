import { api } from "./api.js";
import { getState, setState, getUi } from "./store.js";
import { confirmAction } from "./confirmation.js";
import { render } from "./render.js";
import { ensureSelection } from "./state-ops.js";

export async function exportState() {
  const state = getState();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "sinteticos-lab-state.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function resetDemoData() {
  const ui = getUi();
  const confirmed = await confirmAction({
    title: "Recrear demo y reemplazar estado local",
    body: "Esto reemplazara las personas, tasks, runs y benchmarks actuales por los datos demo. Si quieres conservar tu trabajo, cancela esta accion.",
    confirmLabel: "Recrear demo"
  });
  if (!confirmed) {
    return;
  }
  setState(await api.resetDemo());
  ensureSelection();
  ui.section = "projects";
  render();
}
