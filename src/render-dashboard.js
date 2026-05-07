import { getState, getUi, getRuntime, getSkillsCache } from "./store.js";
import {
  escapeHtml,
  formatShortDate,
  emptyStateMarkup,
  getProjectById,
  severityToClass,
  mostActiveProjectLabel
} from "./utils.js";
import { computeMetrics, getFilteredRuns, metricCard } from "./metrics.js";
import { drawVisualChrome, drawBackground, drawHeatPoints, drawScanPoints, loadScreenshot } from "./canvas.js";
import { fillSelect } from "./forms.js";

export function renderDashboard() {
  const state = getState();
  const ui = getUi();
  const runtime = getRuntime();
  const project = getProjectById(ui.selectedProjectId, state);
  const globalProjects = state.projects || [];
  const globalPersonas = state.personas || [];
  const globalTasks = state.tasks || [];
  const globalRuns = state.runs || [];
  const globalCalibrations = state.calibrations || [];
  // Personas usadas en este proyecto = únicas en runs.persona_id
  const projectRunsForPersonaCount = project ? (state.runs || []).filter((r) => r.project_id === project.id) : [];
  const projectPersonaIds = new Set(projectRunsForPersonaCount.map((r) => r.persona_id));
  const projectPersonas = (state.personas || []).filter((p) => projectPersonaIds.has(p.id));
  const projectTasks = project ? state.tasks.filter((item) => item.project_id === project.id) : [];
  const globalHero = document.getElementById("hero-meta-global");
  const globalMetrics = document.getElementById("global-metrics-grid");
  const globalProjectList = document.getElementById("dashboard-project-list");
  const globalView = document.getElementById("dashboard-global-view");
  const projectView = document.getElementById("dashboard-project-view");

  if (!project) {
    globalView.classList.remove("hidden");
    projectView.classList.add("hidden");
    globalHero.innerHTML = `<div class="hero-chip"><span class="metric-label">Estado</span><strong>Selecciona un proyecto</strong></div>`;
    globalMetrics.innerHTML = [
      metricCard("Usuarios creados", `${globalPersonas.length}`, "Personas sintéticas registradas"),
      metricCard("Runs", `${globalRuns.length}`, "Corridas acumuladas"),
      metricCard("Tasks", `${globalTasks.length}`, "Tareas definidas"),
      metricCard("Benchmarks", `${globalCalibrations.length}`, "Calibraciones humanas"),
      metricCard("Proyecto mas activo", `${mostActiveProjectLabel(state)}`, "Segun cantidad de runs"),
      metricCard("Proyectos listos", `${globalProjects.length}`, "Espacios disponibles para trabajar")
    ].join("");
    globalProjectList.innerHTML =
      globalProjects
        .map((item) => {
          const itemRuns = globalRuns.filter((entry) => entry.project_id === item.id);
          const personas = new Set(itemRuns.map((r) => r.persona_id)).size;
          const tasks = globalTasks.filter((entry) => entry.project_id === item.id).length;
          const runs = globalRuns.filter((entry) => entry.project_id === item.id).length;
          return `
            <article class="list-card" data-project-id="${item.id}">
              <header>
                <div>
                  <strong>${escapeHtml(item.name)}</strong>
                  <p>${escapeHtml(item.description || "Sin descripcion")}</p>
                </div>
                <span class="tag">${formatShortDate(item.created_at)}</span>
              </header>
              <div class="meta-row">
                <span class="pill">${personas} personas</span>
                <span class="pill">${tasks} tasks</span>
                <span class="pill">${runs} runs</span>
              </div>
              <div class="action-row">
                <button class="ghost-button" data-project-action="select" data-id="${item.id}">Seleccionar proyecto</button>
              </div>
            </article>
          `;
        })
        .join("") || emptyStateMarkup("Todavia no hay proyectos. Crea uno para empezar.");
    return;
  }

  globalView.classList.add("hidden");
  projectView.classList.remove("hidden");
  const filteredRuns = getFilteredRuns();
  const metrics = computeMetrics(filteredRuns);
  const heroMeta = document.getElementById("hero-meta");
  heroMeta.innerHTML = `
    <div class="hero-chip"><span class="metric-label">Proyecto activo</span><strong>${project ? escapeHtml(project.name) : "Sin proyecto"}</strong></div>
    <div class="hero-chip"><span class="metric-label">Runs activos</span><strong>${filteredRuns.length}</strong></div>
    <div class="hero-chip"><span class="metric-label">Personas</span><strong>${projectPersonas.length}</strong></div>
    <div class="hero-chip"><span class="metric-label">Tasks</span><strong>${projectTasks.length}</strong></div>
    <div class="hero-chip"><span class="metric-label">Backend</span><strong>${runtime.backend ? "API local" : "fallback"}</strong></div>
  `;

  document.getElementById("metrics-grid").innerHTML = [
    metricCard("Task success rate", `${metrics.successRate}%`, "Corridas completadas"),
    metricCard("Abandonment rate", `${metrics.abandonRate}%`, "Abandono explicito"),
    metricCard("Average completion time", `${metrics.avgSeconds}s`, "Promedio por corrida"),
    metricCard("Average steps", `${metrics.avgSteps}`, "Secuencia observada"),
    metricCard("Critical friction count", `${metrics.criticalCount}`, "Bloqueos recurrentes"),
    metricCard("Consistency score", `${metrics.consistency}%`, "Estabilidad del arquetipo")
  ].join("");

  const qualityMetrics = computeQualityMetrics(state, project.id);
  const qualityGrid = document.getElementById("quality-metrics-grid");
  if (qualityGrid) {
    qualityGrid.innerHTML = [
      metricCard("Realismo percibido", `${qualityMetrics.realismRate}%`, `${qualityMetrics.ratedRuns} runs calificados (≥ 4★)`),
      metricCard("Top queja en runs", qualityMetrics.topRunTag || "—", `${qualityMetrics.topRunTagCount} apariciones`),
      metricCard("Skills útiles", `${qualityMetrics.skillHelpfulRate}%`, `${qualityMetrics.ratedAnalyses} análisis votados`),
      metricCard("Calibración alta", `${qualityMetrics.calibrationOkRate}%`, "Agreement humano ≥ 80%"),
      metricCard("Análisis sorpresivos", `${qualityMetrics.surpriseCount}`, "Detectaron algo no obvio"),
      metricCard("Personas a evolucionar", `${qualityMetrics.personasNeedingEvolve}`, "Con feedback recurrente bajo")
    ].join("");
  }

  fillSelect("filter-persona", [{ id: "all", name: "Todas" }, ...projectPersonas], ui.filters.personaId, false);
  fillSelect("filter-task", [{ id: "all", prompt: "Todas" }, ...projectTasks], ui.filters.taskId, false, (task) => task.prompt || task.name);

  renderRouteList(filteredRuns);
  renderFindingList(filteredRuns);
  drawAggregateVisuals(filteredRuns);
  renderPromptTunerSection(state, project.id);
}

function renderPromptTunerSection(state, projectId) {
  const container = document.getElementById("prompt-tuner-section");
  if (!container) return;
  const projectRuns = (state.runs || []).filter((r) => r.project_id === projectId);
  const negativeRuns = projectRuns.filter((r) => {
    const tags = r.feedback?.tags || [];
    const rating = r.feedback?.rating || 0;
    return rating > 0 && rating <= 2 || tags.some((t) => t === "robotico" || t === "no entiende el dominio" || t === "muy optimista" || t === "comportamiento raro");
  });
  const cache = getSkillsCache();
  const result = cache.tunerResult || null;
  const tuning = !!cache.tuning;

  let body;
  if (tuning) {
    body = `<p class="muted">Analizando ${negativeRuns.length} runs negativos…</p>`;
  } else if (!result) {
    body = `<p>Hay <strong>${negativeRuns.length}</strong> runs con feedback negativo en este proyecto. Si tenés al menos 5, podés ejecutar <code>prompt-tuner</code> para que proponga edits al system prompt de vision.</p>`;
  } else if (!result.ok) {
    body = `<p class="error">Error: ${escapeHtml(result.error || "desconocido")}</p>`;
  } else {
    body = renderTunerResult(result);
  }

  container.innerHTML = `
    <article class="panel prompt-tuner-panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Mejora del prompt</p>
          <h3>Tuning desde feedback</h3>
        </div>
        <div class="panel-actions">
          <button type="button" data-tune-prompt="${projectId}" ${tuning || negativeRuns.length < 5 ? "disabled" : ""}>
            ${result ? "Volver a analizar" : "Analizar runs negativos"}
          </button>
        </div>
      </div>
      ${body}
    </article>
  `;
}

function renderTunerResult(result) {
  const out = result.output || {};
  const verdict = out.verdict || "edits_proposed";
  const verdictLabel = {
    edits_proposed: "Edits propuestos",
    insufficient_data: "Datos insuficientes",
    prompt_well_calibrated: "Prompt bien calibrado"
  }[verdict] || verdict;

  const themes = (out.themes_observed || []).map((t) => `
    <li><strong>${escapeHtml(t.tag)}</strong> · ${t.frequency} apariciones${t.example_quotes?.length ? `<br><em>${t.example_quotes.slice(0, 2).map((q) => escapeHtml(q)).join(" / ")}</em>` : ""}</li>
  `).join("");

  const edits = (out.proposed_edits || []).map((edit, idx) => `
    <article class="tuner-edit">
      <header>
        <span class="pill">${escapeHtml(edit.edit_type)}</span>
        <span class="pill">${escapeHtml(edit.target)}</span>
        ${edit.evidence_runs?.length ? `<span class="pill">${edit.evidence_runs.length} runs</span>` : ""}
      </header>
      ${edit.current_text ? `<div class="tuner-edit__current"><p class="eyebrow">Texto actual (aproximado)</p><pre>${escapeHtml(edit.current_text)}</pre></div>` : ""}
      <div class="tuner-edit__proposed"><p class="eyebrow">Texto propuesto</p><pre>${escapeHtml(edit.proposed_text || "")}</pre></div>
      <p class="tuner-rationale"><strong>Razón:</strong> ${escapeHtml(edit.rationale || "")}</p>
      ${edit.expected_outcome ? `<p class="tuner-impact"><strong>Resultado esperado:</strong> ${escapeHtml(edit.expected_outcome)}</p>` : ""}
      <button type="button" class="ghost-button" data-copy-tuner-edit="${idx}">Copiar texto propuesto</button>
    </article>
  `).join("");

  const nextActions = (out.next_actions || []).map((a) => `<li>${escapeHtml(a)}</li>`).join("");

  return `
    <div class="tuner-verdict tuner-verdict--${verdict}">
      <strong>${escapeHtml(verdictLabel)}</strong>
      <p>${escapeHtml(out.summary || "")}</p>
    </div>
    ${themes ? `<div class="tuner-themes"><p class="eyebrow">Temas observados</p><ul>${themes}</ul></div>` : ""}
    ${edits ? `<div class="tuner-edits">${edits}</div>` : ""}
    ${nextActions ? `<div class="tuner-next"><p class="eyebrow">Próximos pasos</p><ul>${nextActions}</ul></div>` : ""}
    <p class="muted small">Estos cambios deben aplicarse manualmente en <code>server/vision.mjs</code> (función <code>buildSystemPrompt</code>) por un developer.</p>
  `;
}

function computeQualityMetrics(state, projectId) {
  const projectRuns = (state.runs || []).filter((r) => r.project_id === projectId);
  const ratedRuns = projectRuns.filter((r) => r.feedback?.rating);
  const realismCount = projectRuns.filter((r) => (r.feedback?.rating || 0) >= 4).length;
  const realismRate = ratedRuns.length ? Math.round((realismCount / ratedRuns.length) * 100) : 0;

  const tagCounts = {};
  ratedRuns.forEach((r) => {
    (r.feedback?.tags || []).forEach((t) => {
      if (t === "muy realista" || t === "perfecto") return;
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    });
  });
  const topRunTagEntry = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0];
  const topRunTag = topRunTagEntry?.[0] || null;
  const topRunTagCount = topRunTagEntry?.[1] || 0;

  const projectRunIds = new Set(projectRuns.map((r) => r.id));
  const projectAnalyses = (state.run_analyses || []).filter((a) =>
    (a.run_ids || []).some((id) => projectRunIds.has(id))
  );
  const ratedAnalyses = projectAnalyses.filter((a) => a.feedback?.helpful !== undefined && a.feedback?.helpful !== null);
  const helpfulCount = ratedAnalyses.filter((a) => a.feedback?.helpful).length;
  const skillHelpfulRate = ratedAnalyses.length ? Math.round((helpfulCount / ratedAnalyses.length) * 100) : 0;
  const surpriseCount = projectAnalyses.filter((a) => a.feedback?.surprised_me).length;

  const projectCalibrations = (state.calibrations || []).filter((c) => c.project_id === projectId);
  const calibrationOk = projectCalibrations.filter((c) => (c.agreement || 0) >= 80).length;
  const calibrationOkRate = projectCalibrations.length ? Math.round((calibrationOk / projectCalibrations.length) * 100) : 0;

  // Personas needing evolution: ≥ 2 calibrations < 70 OR ≥ 3 runs rated ≤ 2
  const personaIds = new Set(projectRuns.map((r) => r.persona_id));
  let personasNeedingEvolve = 0;
  personaIds.forEach((pid) => {
    const lowCalibs = projectCalibrations.filter((c) => c.persona_id === pid && (c.agreement || 100) < 70).length;
    const lowRuns = projectRuns.filter((r) => r.persona_id === pid && (r.feedback?.rating || 5) <= 2).length;
    if (lowCalibs >= 2 || lowRuns >= 3) personasNeedingEvolve += 1;
  });

  return {
    ratedRuns: ratedRuns.length,
    realismRate,
    topRunTag,
    topRunTagCount,
    ratedAnalyses: ratedAnalyses.length,
    skillHelpfulRate,
    surpriseCount,
    calibrationOkRate,
    personasNeedingEvolve
  };
}

export function renderRouteList(runs) {
  const routeCounts = {};
  runs.forEach((run) => {
    const route = run.screen_transitions.map((transition) => `${transition.from} → ${transition.to}`).join(" · ") || "Single screen";
    routeCounts[route] = (routeCounts[route] || 0) + 1;
  });

  const total = runs.length || 1;
  const entries = Object.entries(routeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const html = entries
    .map(([route, count]) => {
      const percent = Math.round((count / total) * 100);
      return `
        <div class="sankey-block">
          <strong>${escapeHtml(route)}</strong>
          <span>${count} runs · ${percent}%</span>
          <div class="bar-track"><div class="bar-fill" style="width:${percent}%"></div></div>
        </div>
      `;
    })
    .join("");
  document.getElementById("route-list").innerHTML = html || emptyStateMarkup("Aun no hay rutas observadas.");
}

export function renderFindingList(runs) {
  const findings = {};
  runs.forEach((run) => {
    run.report_details.prioritized_findings.forEach((finding) => {
      findings[finding.label] = findings[finding.label] || { ...finding, count: 0 };
      findings[finding.label].count += 1;
    });
  });

  const html = Object.values(findings)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map(
      (finding) => `
        <article class="list-card">
          <header>
            <strong>${escapeHtml(finding.label)}</strong>
            <span class="status-pill ${severityToClass(finding.severity)}">${finding.severity}</span>
          </header>
          <p>${escapeHtml(finding.detail)}</p>
          <div class="meta-row"><span class="pill">${finding.count} repeticiones</span></div>
        </article>
      `
    )
    .join("");
  document.getElementById("finding-list").innerHTML = html || emptyStateMarkup("Aun no hay hallazgos sintetizados.");
}

export async function drawAggregateVisuals(runs) {
  const heatmapCanvas = document.getElementById("aggregate-heatmap");
  const scanpathCanvas = document.getElementById("aggregate-scanpath");
  const firstScreenshot = runs.find((r) => r.screenshots && r.screenshots.length);
  const screenshotSrc = firstScreenshot ? firstScreenshot.screenshots[0].src : null;
  const img = await loadScreenshot(screenshotSrc);
  drawBackground(heatmapCanvas.getContext("2d"), heatmapCanvas, img, "Heatmap agregado");
  drawBackground(scanpathCanvas.getContext("2d"), scanpathCanvas, img, "Scanpath agregado");

  const clickPoints = runs.flatMap((run) => run.click_points || []);
  drawHeatPoints(heatmapCanvas.getContext("2d"), clickPoints);
  drawScanPoints(scanpathCanvas.getContext("2d"), clickPoints.slice(0, 18));
}
