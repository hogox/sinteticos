import { api } from "./api.js";
import { setRuntime, setState } from "./store.js";
import { bindEvents } from "./events.js";
import { render, createRuntimeBadge } from "./render.js";
import { ensureSelection } from "./state-ops.js";

async function bootstrap() {
  setRuntime(await api.health());
  setState(await api.loadState());
  ensureSelection();
  createRuntimeBadge();
  bindEvents();
  render();
}

bootstrap();
