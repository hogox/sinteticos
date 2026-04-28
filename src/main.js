import { api } from "./api.js";
import { setRuntime, setState } from "./store.js";
import { bindEvents } from "./events.js";
import { render, createRuntimeBadge } from "./render.js";
import { ensureSelection } from "./state-ops.js";
import { applyHashRoute, bindHashRouting } from "./router.js";

async function bootstrap() {
  setRuntime(await api.health());
  setState(await api.loadState());
  applyHashRoute();
  ensureSelection();
  createRuntimeBadge();
  bindEvents();
  bindHashRouting(render);
  render();
}

bootstrap();
