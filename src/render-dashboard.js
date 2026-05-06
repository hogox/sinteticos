import { getState, getUi, getRuntime } from "./store.js";
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

  fillSelect("filter-persona", [{ id: "all", name: "Todas" }, ...projectPersonas], ui.filters.personaId, false);
  fillSelect("filter-task", [{ id: "all", prompt: "Todas" }, ...projectTasks], ui.filters.taskId, false, (task) => task.prompt || task.name);

  renderRouteList(filteredRuns);
  renderFindingList(filteredRuns);
  drawAggregateVisuals(filteredRuns);
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
