# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm install              # Install root deps
npm run web:install      # Install web/ frontend deps
npm run dev              # shared:watch + backend (:8787) + web (:5173) via concurrently
npm run server           # Backend only
npm run web              # Frontend only (proxies /api and /artifacts to :8787)
npm run shared:build     # Compile shared/*.ts → shared/*.js + .d.ts (one-shot)
npm run shared:watch     # Watch + recompile on change
npm run typecheck        # Type-check shared + server + web together
npm run web:build        # Build shared + frontend for production

npx playwright install chromium  # Install browser binary for real navigation runs
```

`shared/` is TypeScript: `.ts` is the source of truth, `tsc` emits `.js` + `.d.ts` co-located. The web app imports `.ts` via Vite; the Node server imports the compiled `.js`. Run `npm run shared:build` before starting the server if compiled files are missing, or use `npm run dev` which keeps the watcher running.

The legacy `index.html` + `src/*.js` + `styles.css` is still served at `:8787` but is being eliminated — `web/` (Vite + React) at `:5173` is the active frontend.

## Architecture

### Stack
- **Backend**: Node.js with native `http` (no Express), TypeScript via `tsx`, ESM (`server/*.ts`)
- **Frontend**: React 19, Vite, TanStack Router, React Query, Zustand, Tailwind + shadcn-style components (`web/`)
- **Shared**: TypeScript modules (`shared/*.ts`) compiled to `.js`+`.d.ts`; run in both Node and browser
- **Persistence**: Single JSON file at `data/state.json`
- **Browser automation**: Playwright (optional — falls back to simulation if unavailable)

### Data model
`projects → personas → tasks → runs → calibrations`

Canonical TypeScript types live in `web/src/types/state.ts`. All entities are stored flat in `data/state.json` and returned as a single `AppState` object from `GET /api/state`. The entire state is re-fetched after every mutation — mutations return `{ state: AppState }` and the React Query cache is updated in place via `setStateCache()` in `web/src/api/queries.ts`.

### Web frontend (web/)

**Routing**: TanStack Router with file-based routes in `web/src/routes/`. `routeTree.gen.ts` is auto-generated — never edit it. Route files follow the pattern `entity.$param.tab.tsx`. The root layout (`__root.tsx`) renders `<Sidebar>`, the header, and `<Outlet>`.

**Server state**: Single `useAppState()` query (React Query) loads all data at once. Domain data is derived by filtering `state.projects`, `state.personas`, etc. within route components. Mutations use hooks from `web/src/api/queries.ts` — each calls `setStateCache(qc, state)` on success to avoid a refetch.

**UI state**: Zustand store at `web/src/stores/ui.ts` (`useUI`) holds transient view state: lightbox, selected run, run detail tab, skills tab, chat drawer open/persona.

**Component layers**: `web/src/components/ui/` — unstyled primitives (Button, Card, Dialog, Input, Badge). `web/src/features/` — domain panels (PersonaCard, RunDetail, SkillsSection, etc.). `web/src/components/` — layout shells (Sidebar, Lightbox, ChatDrawer).

**Path alias**: `@` resolves to `web/src/`.

### Run execution pipeline

`POST /api/tasks/:id/runs` → `server/runner.ts:executeRun()` dispatches by task type and URL:

1. **Figma MCP run** (`task.mcp_enabled && FIGMA_ACCESS_TOKEN && figma URL`): `server/figma-mcp-run.ts` — calls Figma REST API for node structure + screenshots, then `chooseCandidate()` simulates navigation.
2. **Playwright navigation run** (any `navigation` task with a URL): `server/navigation-run.ts` — launches Chromium, settles the surface (handles Figma login walls, loading states), drives interaction via `collectCandidates()` + `chooseCandidate()`.
3. **Five-second test** (`five_second_test` task type): `server/five-second-test.ts`
4. **Simulated run** (fallback or `idea` tasks): `shared/simulation.ts:simulateRun()` — runs in both backend and browser.

All paths produce the same `Run` shape persisted to state. `safeExecuteRun` converts crashes to persisted error runs.

### Web vs Figma detection
`server/url-utils.ts` exports `isFigmaUrl(url)` — all modules use this instead of inline regex. In `navigation-run.ts`, early `isFigma` detection forks: viewport (390×844 vs 1280×800), sidebar strip, `settleFigmaSurface`, and `useVision`. For real web URLs, the run `engine` is `"playwright-web"`. Optional task fields `viewport_width`, `viewport_height`, and `vision_enabled` override defaults.

### Lighthouse
`server/lighthouse-runner.ts` exports `runLighthouse(url, { formFactor })`. Activated by `task.lighthouse_enabled`. Launches Chromium via Playwright's executable with a random `--remote-debugging-port`, runs the audit, returns `{ scores, audits, url, fetch_time, lighthouse_version }` or `null` on error. `run.lighthouse` is a top-level field alongside `screenshots`.

### Figma-specific layers
- `server/figma-surface.ts`: detects Figma surface states (loading, login-wall, interactive, blocked)
- `server/figma-advanced.ts`: blind wake sequences, pixel analysis for interactive frame detection
- `server/frame-detection.ts`: visual frame boundary detection within Figma embeds
- `server/figma-mcp-run.ts`: URL parser + Figma REST API adapter (nodes, screenshots, transitions)

### Skills system
Post-run analysis plugins in `skills/<name>/`. Each skill folder contains:
- `SKILL.md`: YAML frontmatter (name, inputs, providers, default_model) + system prompt body
- `schema.json`: JSON Schema for the output

Runtime: `skills/_runtime/loader.ts` reads skill folders; `executor.ts` builds the LLM payload, calls the provider, validates the response against the schema. Skills are invoked via `POST /api/skills/:name/run`. Auto-discovered on server start — no registration needed.

### LLM providers
`skills/_runtime/providers.ts` supports Anthropic, OpenAI, Google. Selection by env var presence. Default model for persona generation and chat: `claude-sonnet-4-6` (`server/anthropic.ts`).

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

Config is centralized in `server/config.ts`. Loaded from `.env.local` at startup.

## Key conventions

- **Observed / Inferred / Predictive** are hard epistemic categories. Never conflate them. `observed` requires direct run evidence; `inferred` is analytical; `predictive` is estimated attention, never real measurement.
- **Runs are immutable once persisted.** The `safeExecuteRun` wrapper converts crashes to persisted error runs rather than losing them.
- **Shared modules** (`shared/*.ts` / compiled `.js`) run in both Node and browser — no Node-only APIs.
- Task `type` is `"navigation"` (URL-driven), `"idea"` (reaction/evaluation), or `"five_second_test"`. The runner branches on this.
- The `engine` field on a run records how it was executed: `playwright`, `playwright-vision`, `mcp`, `mcp-playwright-fallback`, `server-simulated`, `browser-simulated`.

## Adding a new skill

1. Create `skills/<name>/` with `SKILL.md` (frontmatter + system prompt) and `schema.json`
2. Inputs declared in frontmatter (`run`, `persona`, `task`, `project`); set `batch: true` for multi-run skills
3. The skill is auto-discovered on next server start
