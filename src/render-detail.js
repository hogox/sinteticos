import { drawVisualChrome, drawBackground, drawHeatPoints, drawScanPoints, loadScreenshot } from "./canvas.js";
import { escapeHtml, severityToClass } from "./utils.js";
import { getRuntime, getSkillsCache } from "./store.js";

function renderScreenStep(item, run) {
  const step = (run.step_log || []).find((s) => s.step === item.step);
  const certainty = step ? `${step.certainty}% certeza` : "";
  const action = step ? step.action : "";
  const reason = step ? step.reason : "";
  return `
    <figure class="screens-stack__figure">
      <img src="${item.src}" alt="${escapeHtml(item.screen)}" data-zoom-src="${item.src}" />
      <figcaption class="screens-stack__caption">
        <div class="screens-stack__caption-head">
          <span class="screens-stack__step-pill">Paso ${item.step}</span>
          <strong>${escapeHtml(item.screen)}</strong>
          ${action ? `<span class="pill">${escapeHtml(action)}</span>` : ""}
          ${certainty ? `<span class="pill">${certainty}</span>` : ""}
        </div>
        ${reason ? `<p class="screens-stack__reason">${escapeHtml(reason)}</p>` : ""}
      </figcaption>
    </figure>
  `;
}

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
    <div class="screens-stack">
      <div class="visual-row">
        <div class="detail-card">
          <p class="eyebrow">Heatmap</p>
          <div class="visual-stage">
            <canvas id="run-heatmap" width="360" height="640" data-zoom-canvas="run-heatmap"></canvas>
          </div>
        </div>
        <div class="detail-card">
          <p class="eyebrow">Scanpath</p>
          <div class="visual-stage">
            <canvas id="run-scanpath" width="360" height="640" data-zoom-canvas="run-scanpath"></canvas>
          </div>
        </div>
      </div>
      <p class="eyebrow screens-stack__eyebrow">Recorrido</p>
      <div class="screens-stack__list">
        ${(run.screenshots || []).map((item) => renderScreenStep(item, run)).join("")}
      </div>
    </div>
    ${lighthousePanelHtml(run)}
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

export function skillAnalysisHtml(run) {
  const runtime = getRuntime();
  const skillsCache = getSkillsCache();
  if (!skillsCache.loaded || !skillsCache.list.length) return "";
  const providers = runtime.skills?.providers_available || [];
  if (!providers.length) return "";

  const options = skillsCache.list
    .filter((s) => !s.batch && s.name !== "lighthouse-analyst")
    .map((s) => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`)
    .join("");
  const providerOptions = providers
    .map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`)
    .join("");
  const isAnalyzing = skillsCache.analyzing;
  const hasResult = skillsCache.lastResult && skillsCache.lastRunId === run.id;

  return `
    <div class="detail-card skill-analysis-panel">
      <p class="eyebrow">Analisis con skills</p>
      <div class="skill-controls">
        <select id="skill-picker">${options}</select>
        <select id="skill-provider-picker">${providerOptions}</select>
        <button class="ghost-button" data-skill-action="analyze" ${isAnalyzing ? "disabled" : ""}>
          ${isAnalyzing ? "Analizando..." : "Analizar"}
        </button>
      </div>
      ${hasResult ? renderSkillResult(skillsCache.lastResult) : ""}
    </div>
  `;
}

export function skillBatchHtml(runs) {
  const runtime = getRuntime();
  const skillsCache = getSkillsCache();
  if (!skillsCache.loaded || !skillsCache.list.length) return "";
  const providers = runtime.skills?.providers_available || [];
  if (!providers.length) return "";
  const batchSkills = skillsCache.list.filter((s) => s.batch);
  if (!batchSkills.length) return "";

  const options = batchSkills
    .map((s) => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`)
    .join("");
  const providerOptions = providers
    .map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`)
    .join("");
  const hasResult = skillsCache.lastResult && skillsCache.lastRunId === "batch";

  return `
    <div class="detail-card skill-analysis-panel">
      <p class="eyebrow">Analisis batch (${runs.length} runs)</p>
      <div class="skill-controls">
        <select id="skill-batch-picker">${options}</select>
        <select id="skill-batch-provider-picker">${providerOptions}</select>
        <button class="ghost-button" data-skill-action="analyze-batch" ${skillsCache.analyzing ? "disabled" : ""}>
          ${skillsCache.analyzing ? "Analizando..." : "Analizar todos"}
        </button>
      </div>
      ${hasResult ? renderSkillResult(skillsCache.lastResult) : ""}
    </div>
  `;
}

function renderAnalysisFeedback(result) {
  const fb = result.feedback || {};
  const helpful = fb.helpful;
  const accuracy = fb.accuracy || 0;
  const surprised = !!fb.surprised_me;
  const stars = [1, 2, 3, 4, 5].map((n) =>
    `<button type="button" class="rating-star ${n <= accuracy ? "is-active" : ""}" data-rate-analysis="${result.analysis_id}" data-accuracy="${n}" aria-label="${n}">★</button>`
  ).join("");
  return `
    <div class="analysis-feedback">
      <span class="analysis-feedback__label">¿Te sirvió este análisis?</span>
      <div class="analysis-feedback__row">
        <button type="button" class="thumb ${helpful === true ? "is-active is-up" : ""}" data-rate-analysis="${result.analysis_id}" data-helpful="true" aria-label="Útil">👍</button>
        <button type="button" class="thumb ${helpful === false ? "is-active is-down" : ""}" data-rate-analysis="${result.analysis_id}" data-helpful="false" aria-label="No útil">👎</button>
        <span class="analysis-feedback__sep">·</span>
        <span class="analysis-feedback__sub">Precisión:</span>
        <span class="rating-stars">${stars}</span>
        <span class="analysis-feedback__sep">·</span>
        <label class="analysis-feedback__check">
          <input type="checkbox" data-rate-analysis="${result.analysis_id}" data-surprise="true" ${surprised ? "checked" : ""}>
          me sorprendió
        </label>
      </div>
    </div>
  `;
}

function renderSkillResult(result) {
  if (!result) return "";
  if (!result.ok) {
    return `
      <div class="skill-result skill-result-error">
        <p><strong>Error:</strong> ${escapeHtml(result.error || "Error desconocido")}</p>
        ${result.details ? `<p class="meta-row">${result.details.map((d) => `<span class="pill">${escapeHtml(d)}</span>`).join("")}</p>` : ""}
      </div>
    `;
  }

  const meta = `<div class="meta-row">
    <span class="pill">${escapeHtml(result.provider)}</span>
    <span class="pill">${escapeHtml(result.model)}</span>
    <span class="pill">${result.latency_ms}ms</span>
  </div>${result.analysis_id ? renderAnalysisFeedback(result) : ""}`;

  const output = result.output;
  let body = "";

  if (output.findings) {
    body = output.findings
      .map((f) => `
        <div class="timeline-entry">
          <strong>${escapeHtml(f.label)}</strong>
          <span class="status-pill ${severityToClass(f.severity)}">${f.severity}</span>
          <p>${escapeHtml(f.detail)}</p>
          ${f.recommendation ? `<p class="skill-recommendation">${escapeHtml(f.recommendation)}</p>` : ""}
          ${f.evidence_steps ? `<p class="meta-row">${f.evidence_steps.map((s) => `<span class="pill">paso ${s}</span>`).join("")}</p>` : ""}
        </div>
      `)
      .join("");
  } else if (output.issues) {
    body = output.issues
      .map((i) => `
        <div class="timeline-entry">
          <strong>${escapeHtml(i.label)}</strong>
          <span class="status-pill ${severityToClass(i.severity)}">${i.severity}</span>
          <p>${escapeHtml(i.detail)}</p>
          ${i.recommendation ? `<p class="skill-recommendation">${escapeHtml(i.recommendation)}</p>` : ""}
        </div>
      `)
      .join("");
  } else if (output.deviations !== undefined) {
    const score = typeof output.score === "number" ? `Score: ${(output.score * 100).toFixed(0)}%` : "";
    body = `<p>${escapeHtml(output.explanation || "")} ${score}</p>` +
      (output.deviations || [])
        .map((d) => `
          <div class="timeline-entry">
            <strong>${escapeHtml(d.label)}</strong>
            <span class="status-pill ${severityToClass(d.severity)}">${d.severity}</span>
            <p>${escapeHtml(d.detail)}</p>
            ${d.expected_behavior ? `<p class="skill-recommendation">${escapeHtml(d.expected_behavior)}</p>` : ""}
          </div>
        `)
        .join("");
  } else if (output.recommendations) {
    body = output.recommendations
      .map((r) => `
        <div class="timeline-entry">
          <strong>${r.priority}. ${escapeHtml(r.label)}</strong>
          <span class="status-pill ${severityToClass(r.expected_impact === "high" ? "high" : r.expected_impact === "low" ? "low" : "medium")}">${r.type}</span>
          <p>${escapeHtml(r.detail)}</p>
        </div>
      `)
      .join("");
  } else if (output.summary) {
    body = `<p>${escapeHtml(output.summary)}</p>`;
  }

  return `<div class="skill-result">${meta}<div class="timeline">${body}</div></div>`;
}

function lhScoreClass(score) {
  if (score === null || score === undefined) return "lh-score--na";
  if (score >= 90) return "lh-score--good";
  if (score >= 50) return "lh-score--medium";
  return "lh-score--bad";
}

function lhScoreHtml(label, score) {
  const cls = lhScoreClass(score);
  const display = score !== null && score !== undefined ? score : "—";
  return `<div class="lh-score ${cls}">
    <span class="lh-score-value">${display}</span>
    <span class="lh-score-label">${escapeHtml(label)}</span>
  </div>`;
}

function lighthousePanelHtml(run) {
  const runtime = getRuntime();
  const skillsCache = getSkillsCache();
  const lh = run.lighthouse;

  if (!lh) return "";

  const { scores, audits, url, fetch_time, lighthouse_version } = lh;
  const auditEntries = Object.values(audits || {})
    .filter((a) => a.display_value)
    .map((a) => `
      <div class="timeline-entry">
        <strong>${escapeHtml(a.title)}</strong>
        <p>${escapeHtml(a.display_value)}</p>
      </div>
    `)
    .join("");

  const providers = runtime.skills?.providers_available || [];
  const providerOptions = providers
    .map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`)
    .join("");

  const hasLighthouseSkill = skillsCache.list.some((s) => s.name === "lighthouse-analyst");
  const canAnalyze = hasLighthouseSkill && providers.length > 0;
  const isAnalyzing = skillsCache.lhAnalyzing;
  const hasAnalysis = skillsCache.lhResult && skillsCache.lhRunId === run.id;
  const view = skillsCache.lhView || "summary";

  return `
    <div class="detail-card lighthouse-panel">
      <p class="eyebrow">Lighthouse · <span class="lh-url">${escapeHtml(url || "")}</span></p>
      <div class="lh-scores">
        ${lhScoreHtml("Performance", scores.performance)}
        ${lhScoreHtml("Accesibilidad", scores.accessibility)}
        ${lhScoreHtml("Best Practices", scores.best_practices)}
        ${lhScoreHtml("SEO", scores.seo)}
      </div>
      ${auditEntries ? `<div class="timeline lh-audits">${auditEntries}</div>` : ""}
      <div class="meta-row" style="margin-top:0.5rem">
        ${lighthouse_version ? `<span class="pill">v${escapeHtml(lighthouse_version)}</span>` : ""}
        ${fetch_time ? `<span class="pill">${escapeHtml(fetch_time.slice(0, 10))}</span>` : ""}
      </div>
      ${canAnalyze ? `
        <div class="skill-controls" style="margin-top:0.75rem">
          ${providers.length > 1 ? `<select id="lh-provider-picker">${providerOptions}</select>` : `<input type="hidden" id="lh-provider-picker" value="${escapeHtml(providers[0])}" />`}
          <button class="ghost-button" data-lighthouse-action="analyze" ${isAnalyzing ? "disabled" : ""}>
            ${isAnalyzing ? "Analizando..." : "Analizar con IA"}
          </button>
          ${hasAnalysis ? `
            <button class="ghost-button" data-lighthouse-action="toggle-view">
              ${view === "summary" ? "Ver detalle" : "Ver resumen"}
            </button>
          ` : ""}
        </div>
        ${hasAnalysis ? renderLighthouseAnalysis(skillsCache.lhResult, view) : ""}
      ` : ""}
    </div>
  `;
}

function renderLighthouseAnalysis(result, view) {
  if (!result) return "";
  if (!result.ok) {
    return `<div class="skill-result skill-result-error"><p>${escapeHtml(result.error || "Error desconocido")}</p></div>`;
  }

  const output = result.output;
  const meta = `<div class="meta-row">
    <span class="pill">${escapeHtml(result.provider)}</span>
    <span class="pill">${escapeHtml(result.model)}</span>
    <span class="pill">${result.latency_ms}ms</span>
  </div>${result.analysis_id ? renderAnalysisFeedback(result) : ""}`;

  const verdictClass = output.overall_verdict === "pass"
    ? "completed"
    : output.overall_verdict === "fail"
    ? "abandoned"
    : "uncertain";

  const summaryHtml = `
    <div class="timeline-entry">
      <span class="status-pill ${verdictClass}">${escapeHtml(output.overall_verdict || "")}</span>
      <p>${escapeHtml(output.summary || "")}</p>
    </div>
  `;

  if (view === "summary") {
    return `<div class="skill-result">${meta}<div class="timeline">${summaryHtml}</div></div>`;
  }

  const findingsHtml = (output.findings || [])
    .map((f) => `
      <div class="timeline-entry">
        <strong>${escapeHtml(f.label)}</strong>
        <span class="status-pill ${severityToClass(f.severity)}">${f.severity}</span>
        <span class="pill">${escapeHtml(f.category)}</span>
        <p>${escapeHtml(f.detail)}</p>
        ${f.recommendation ? `<p class="skill-recommendation">${escapeHtml(f.recommendation)}</p>` : ""}
      </div>
    `)
    .join("");

  return `<div class="skill-result">${meta}<div class="timeline">${summaryHtml}${findingsHtml}</div></div>`;
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
