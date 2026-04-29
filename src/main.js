import { api } from "./api.js";
import { setRuntime, setState, setSkillsCache } from "./store.js";
import { bindEvents } from "./events.js";
import { render, createRuntimeBadge } from "./render.js";
import { ensureSelection } from "./state-ops.js";
import { applyHashRoute, bindHashRouting } from "./router.js";

async function bootstrap() {
  setRuntime(await api.health());
  setState(await api.loadState());
  const skills = await api.loadSkills();
  if (skills.length) {
    setSkillsCache({ list: skills, loaded: true });
  }
  applyHashRoute();
  ensureSelection();
  createRuntimeBadge();
  bindEvents();
  bindHashRouting(render);
  render();
}

bootstrap();
