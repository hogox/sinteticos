# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run dev        # Start server on http://localhost:8787
npm install        # Install dependencies
npx playwright install chromium  # Install browser binary for real navigation runs
```

No build step, no test runner, no linter configured.

## Architecture

### Stack
- **Backend**: Node.js with native `http` (no Express), ESM throughout (`server/*.mjs`)
- **Frontend**: Vanilla JS (`src/*.js`, `shared/*.js`), no framework, no build step
- **Persistence**: Single JSON file at `data/state.json`
- **Browser automation**: Playwright (optional — falls back to simulation if unavailable)

### Data model
`projects → personas → tasks → runs → calibrations`

All entities live in `data/state.json`. The frontend operates either against the backend API or falls back to `localStorage` (key: `sinteticos-lab-state-v2`) when the server is unreachable.

### Run execution pipeline

`POST /api/tasks/:id/runs` → `server/runner.mjs:executeRun()` dispatches by task type and URL:

1. **Figma MCP run** (`task.mcp_enabled && FIGMA_ACCESS_TOKEN && figma URL`): `server/figma-mcp-run.mjs` — calls Figma REST API directly to get node structure and screenshots, then uses `chooseCandidate()` to simulate navigation.
2. **Playwright navigation run** (any `navigation` task with a URL): `server/navigation-run.mjs` — launches Chromium, navigates to the URL, settles the surface (handles Figma login walls, loading states), and drives interaction via `collectCandidates()` + `chooseCandidate()`.
3. **Simulated run** (fallback or `idea` tasks): `shared/simulation.js:simulateRun()` — pure JS simulation, runs in both backend and browser (shared module).

All three paths produce the same run shape persisted to state.

### Web vs Figma detection
`server/url-utils.mjs` exporta `isFigmaUrl(url)` — todos los módulos usan esta función en lugar de regex inline. En `navigation-run.mjs`, la detección temprana de `isFigma` bifurca: viewport (390×844 vs 1280×800), strip de sidebar, `settleFigmaSurface`, y `useVision`. Para webs reales, el `engine` del run es `"playwright-web"`. Los campos opcionales `task.viewport_width`, `task.viewport_height`, y `task.vision_enabled` permiten personalizar el comportamiento para webs.

### Lighthouse
`server/lighthouse-runner.mjs` exporta `runLighthouse(url, { formFactor })`. Se activa por `task.lighthouse_enabled`. Lanza Chromium via el ejecutable de Playwright con `--remote-debugging-port` aleatorio, corre la auditoría, y retorna `{ scores, audits, url, fetch_time, lighthouse_version }` o `null` (si `lighthouse` no está instalado, o hay error). El campo `run.lighthouse` vive al mismo nivel que `screenshots`. Requiere `npm install` para instalar el paquete `lighthouse`.

### Figma-specific layers
- `server/figma-surface.mjs`: detects Figma surface states (loading, login-wall, interactive, blocked)
- `server/figma-advanced.mjs`: blind wake sequences, pixel analysis for interactive frame detection
- `server/frame-detection.mjs`: visual frame boundary detection within Figma embeds
- `figma-mcp-client.mjs`: URL parser + Figma REST API adapter (nodes, screenshots, transitions)

### Skills system
Post-run analysis plugins in `skills/<name>/`. Each skill is a folder with:
- `SKILL.md`: YAML frontmatter (name, inputs, providers, default_model) + system prompt body
- `schema.json`: JSON Schema for the output

Runtime: `skills/_runtime/loader.mjs` reads skill folders; `executor.mjs` builds the LLM payload, calls the provider, validates the response against the schema. Skills are invoked via `POST /api/skills/:name/run`.

Available skills: `friction-analyst`, `coverage-analyst`, `persona-coherence`, `recommendation-generator`.

### LLM providers
`skills/_runtime/providers.mjs` supports Anthropic, OpenAI, Google. Selection by env var presence. Default model for persona generation and chat: `claude-sonnet-4-6` (`server/anthropic.mjs`).

### Frontend modules
- `src/store.js`: global mutable state (`state`, `runtime`, `ui`, `skillsCache`) with named getters/setters
- `src/router.js`: hash-based routing (`#projects`, `#personas`, etc.)
- `src/render*.js`: pure render functions that write to DOM; called on every state change
- `src/events.js`: all event listener bindings
- `src/api.js`: all fetch calls to the backend

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Required for LLM features |
| `FIGMA_ACCESS_TOKEN` | — | Enables Figma MCP mode |
| `SINTETICOS_BROWSER_HEADLESS` | `true` | Set to `false` to see Chrome during runs (debug) |
| `SINTETICOS_LIGHTHOUSE` | `true` | Set to `false` to disable Lighthouse globally |
| `SINTETICOS_LIGHTHOUSE_TIMEOUT_MS` | `60000` | Lighthouse audit timeout |
| `SINTETICOS_VISION_MODEL` | `claude-haiku-4-5-20251001` | Model for screenshot vision analysis |
| `SINTETICOS_VISION_LIMIT_USD` | `5` | Spend cap for vision per session |
| `PORT` | `8787` | Server port |

Config is centralized in `server/config.mjs`.

## Key conventions

- **Observed / Inferred / Predictive** are hard epistemic categories. Never conflate them. `observed` requires direct run evidence; `inferred` is analytical; `predictive` is estimated attention, never real measurement.
- **Runs are immutable once persisted.** The `safeExecuteRun` wrapper converts crashes to persisted error runs rather than losing them.
- **Shared modules** (`shared/*.js`) run in both Node and browser — no Node-only APIs there.
- Task `type` is either `"navigation"` (URL-driven) or `"idea"` (reaction/evaluation). The runner branches on this.
- The `engine` field on a run records how it was executed: `playwright`, `playwright-vision`, `mcp`, `mcp-playwright-fallback`, `server-simulated`, `browser-simulated`.

## Adding a new skill

1. Create `skills/<name>/` with `SKILL.md` (frontmatter + system prompt) and `schema.json`
2. The skill is auto-discovered on next server start — no registration needed
3. Inputs declared in frontmatter (`run`, `persona`, `task`, `project`); set `batch: true` for multi-run skills
