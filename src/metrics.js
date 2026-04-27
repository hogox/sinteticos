import { getState, getUi } from "./store.js";

export function computeMetrics(runs) {
  if (!runs.length) {
    return { successRate: 0, abandonRate: 0, avgSeconds: 0, avgSteps: 0, criticalCount: 0, consistency: 0 };
  }

  const successCount = runs.filter((run) => run.completion_status === "completed").length;
  const abandonCount = runs.filter((run) => run.completion_status === "abandoned" || run.completion_status === "error").length;
  const avgSeconds = Math.round(
    runs.reduce((sum, run) => sum + (new Date(run.ended_at).getTime() - new Date(run.started_at).getTime()) / 1000, 0) / runs.length
  );
  const avgSteps = (runs.reduce((sum, run) => sum + run.step_log.length, 0) / runs.length).toFixed(1);
  const criticalCount = runs.reduce(
    (sum, run) => sum + (run.report_details.prioritized_findings || []).filter((finding) => finding.severity === "critical").length,
    0
  );
  const statusCounts = {};
  runs.forEach((run) => {
    statusCounts[run.persona_id] = statusCounts[run.persona_id] || { total: 0, completed: 0 };
    statusCounts[run.persona_id].total += 1;
    if (run.completion_status === "completed") {
      statusCounts[run.persona_id].completed += 1;
    }
  });
  const consistency = Math.round(
    Object.values(statusCounts).reduce((sum, item) => sum + (item.completed / item.total) * 100, 0) / Object.keys(statusCounts).length
  );
  return {
    successRate: Math.round((successCount / runs.length) * 100),
    abandonRate: Math.round((abandonCount / runs.length) * 100),
    avgSeconds,
    avgSteps,
    criticalCount,
    consistency
  };
}

export function getFilteredRuns() {
  const state = getState();
  const ui = getUi();
  return state.runs.filter((run) => {
    if (ui.selectedProjectId && run.project_id !== ui.selectedProjectId) {
      return false;
    }
    if (ui.filters.personaId !== "all" && run.persona_id !== ui.filters.personaId) {
      return false;
    }
    if (ui.filters.taskId !== "all" && run.task_id !== ui.filters.taskId) {
      return false;
    }
    if (ui.filters.status !== "all" && run.completion_status !== ui.filters.status) {
      return false;
    }
    return true;
  });
}

export function metricCard(label, valueText, caption) {
  return `
    <article class="metric-card">
      <div class="metric-label">${label}</div>
      <strong class="metric-value">${valueText}</strong>
      <p class="metric-caption">${caption}</p>
    </article>
  `;
}
