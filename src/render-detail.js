import { drawVisualChrome, drawBackground, drawHeatPoints, drawScanPoints, loadScreenshot } from "./canvas.js";
import { escapeHtml, severityToClass } from "./utils.js";

export function observedDetailHtml(run) {
  return `
    <div class="panel-grid">
      <div class="detail-card">
        <p class="eyebrow">Execution mode</p>
        <p>${escapeHtml(run.engine || "simulated")} · ${escapeHtml(run.execution_notes || "Sin notas")}</p>
        <div class="meta-row">
          <span class="pill">MCP ${run.mcp_enabled ? "enabled" : "off"}</span>
          <span class="pill">${escapeHtml(run.source || "local")}</span>
        </div>
      </div>
      <div class="detail-card">
        <p class="eyebrow">Completion</p>
        <p>${escapeHtml(run.completion_status)}</p>
        <div class="meta-row">
          <span class="pill">${run.step_log.length} pasos</span>
          <span class="pill">${run.click_points.length} clicks</span>
        </div>
      </div>
    </div>
    <div class="run-detail-grid">
      <div class="detail-card">
        <div class="visual-stage">
          <canvas id="run-heatmap" width="360" height="640"></canvas>
        </div>
      </div>
      <div class="detail-card">
        <div class="visual-stage">
          <canvas id="run-scanpath" width="360" height="640"></canvas>
        </div>
      </div>
    </div>
    <div class="panel-grid">
      <div class="timeline-card">
        <p class="eyebrow">Screens</p>
        <div class="screens-grid">
          ${(run.screenshots || [])
            .map(
              (item) => `
                <figure>
                  <img src="${item.src}" alt="${escapeHtml(item.screen)}" />
                  <figcaption>${escapeHtml(item.screen)} · paso ${item.step}</figcaption>
                </figure>
              `
            )
            .join("")}
        </div>
      </div>
      <div class="timeline-card">
        <p class="eyebrow">Timeline</p>
        <div class="timeline">
          ${(run.step_log || [])
            .map(
              (step) => `
                <div class="timeline-entry">
                  <strong>Paso ${step.step} · ${escapeHtml(step.action)}</strong>
                  <p>${escapeHtml(step.reason)}</p>
                  <p>${escapeHtml(step.screen)} · ${step.certainty}% certeza</p>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}

export function inferredDetailHtml(run, persona, task) {
  return `
    <div class="panel-grid">
      <div class="detail-card">
        <p class="eyebrow">Persona response</p>
        <p>${escapeHtml(run.persona_response)}</p>
        <div class="meta-row">
          ${(run.follow_up_questions || []).map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("")}
        </div>
      </div>
      <div class="detail-card">
        <p class="eyebrow">Research report</p>
        <p><strong>Resumen:</strong> ${escapeHtml(run.report_summary)}</p>
        <p><strong>Persona:</strong> ${persona ? escapeHtml(persona.name) : "N/A"}</p>
        <p><strong>Task:</strong> ${task ? escapeHtml(task.prompt) : "N/A"}</p>
        <div class="timeline">
          ${(run.report_details.prioritized_findings || [])
            .map(
              (finding) => `
                <div class="timeline-entry">
                  <strong>${escapeHtml(finding.label)}</strong>
                  <p>${escapeHtml(finding.detail)}</p>
                  <span class="status-pill ${severityToClass(finding.severity)}">${finding.severity}</span>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}

export function predictiveDetailHtml(run, task) {
  const enabled = task && task.predictive_attention_enabled;
  return `
    <div class="panel-grid">
      <div class="detail-card">
        <div class="visual-stage">
          <canvas id="run-predictive" width="360" height="640"></canvas>
        </div>
      </div>
      <div class="detail-card">
        <p class="eyebrow">Contexto</p>
        <p>
          Esta vista representa una capa estimada de atencion visual. Esta separada de los clicks reales y de la ruta
          observada para evitar confundir prediccion con evidencia.
        </p>
        <div class="timeline">
          ${
            run.predicted_attention_maps && run.predicted_attention_maps.length
              ? run.predicted_attention_maps[0].notes
                  .map((note) => `<div class="timeline-entry"><p>${escapeHtml(note)}</p></div>`)
                  .join("")
              : `<div class="empty-state">${enabled ? "No se genero mapa predictivo en este run." : "El task no activo predictive attention."}</div>`
          }
        </div>
      </div>
    </div>
  `;
}

export async function drawRunObserved(run) {
  const heatCanvas = document.getElementById("run-heatmap");
  const scanCanvas = document.getElementById("run-scanpath");
  if (!heatCanvas || !scanCanvas) {
    return;
  }
  const screenshotSrc = run.screenshots && run.screenshots.length ? run.screenshots[0].src : null;
  const img = await loadScreenshot(screenshotSrc);
  const title = run.report_details.primary_screen || "Observed";
  drawBackground(heatCanvas.getContext("2d"), heatCanvas, img, title);
  drawBackground(scanCanvas.getContext("2d"), scanCanvas, img, title);
  drawHeatPoints(heatCanvas.getContext("2d"), run.click_points || []);
  drawScanPoints(scanCanvas.getContext("2d"), run.click_points || []);
}

export async function drawPredictiveCanvas(run) {
  const predictiveCanvas = document.getElementById("run-predictive");
  if (!predictiveCanvas) {
    return;
  }
  const screenshotSrc = run.screenshots && run.screenshots.length ? run.screenshots[0].src : null;
  const img = await loadScreenshot(screenshotSrc);
  drawBackground(predictiveCanvas.getContext("2d"), predictiveCanvas, img, "Predictive attention");
  if (run.predicted_attention_maps && run.predicted_attention_maps.length) {
    drawHeatPoints(predictiveCanvas.getContext("2d"), run.predicted_attention_maps[0].points, true);
  }
}
