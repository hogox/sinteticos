import { getState, getUi } from "./store.js";
import {
  emptyStateMarkup,
  escapeHtml,
  formatShortDate,
  getPersonaById,
  getProjectById,
  getTaskById,
  labelTaskType,
  labelDigitalLevel,
  severityToClass,
  statusClass
} from "./utils.js";

function buildRouteLabel(run) {
  const transitions = run.screen_transitions || [];
  if (!transitions.length) {
    return run.screenshots && run.screenshots.length ? run.screenshots.map((item) => item.screen).join(" -> ") : "Single screen";
  }
  return transitions.map((transition) => `${transition.from} -> ${transition.to}`).join(" -> ");
}

function runDurationSeconds(run) {
  const startedAt = new Date(run.started_at || 0).getTime();
  const endedAt = new Date(run.ended_at || run.started_at || 0).getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) {
    return 0;
  }
  return Math.max(0, Math.round((endedAt - startedAt) / 1000));
}

function roundMetric(value, digits = 1) {
  return Number(Number(value || 0).toFixed(digits));
}

function computePersonaStats(runs) {
  if (!runs.length) {
    return {
      runCount: 0,
      successRate: 0,
      avgSteps: 0,
      avgSeconds: 0,
      criticalPerRun: 0,
      totalCritical: 0
    };
  }

  const completed = runs.filter((run) => run.completion_status === "completed").length;
  const totalCritical = runs.reduce(
    (sum, run) => sum + (run.report_details?.prioritized_findings || []).filter((finding) => finding.severity === "critical").length,
    0
  );

  return {
    runCount: runs.length,
    successRate: Math.round((completed / runs.length) * 100),
    avgSteps: roundMetric(runs.reduce((sum, run) => sum + (run.step_log?.length || 0), 0) / runs.length),
    avgSeconds: Math.round(runs.reduce((sum, run) => sum + runDurationSeconds(run), 0) / runs.length),
    criticalPerRun: roundMetric(totalCritical / runs.length, 2),
    totalCritical
  };
}

function averageStats(items) {
  if (!items.length) {
    return { runCount: 0, successRate: 0, avgSteps: 0, avgSeconds: 0, criticalPerRun: 0, totalCritical: 0 };
  }

  const totals = items.reduce(
    (acc, item) => ({
      runCount: acc.runCount + item.runCount,
      successRate: acc.successRate + item.successRate,
      avgSteps: acc.avgSteps + item.avgSteps,
      avgSeconds: acc.avgSeconds + item.avgSeconds,
      criticalPerRun: acc.criticalPerRun + item.criticalPerRun,
      totalCritical: acc.totalCritical + item.totalCritical
    }),
    { runCount: 0, successRate: 0, avgSteps: 0, avgSeconds: 0, criticalPerRun: 0, totalCritical: 0 }
  );

  return {
    runCount: totals.runCount,
    successRate: Math.round(totals.successRate / items.length),
    avgSteps: roundMetric(totals.avgSteps / items.length),
    avgSeconds: Math.round(totals.avgSeconds / items.length),
    criticalPerRun: roundMetric(totals.criticalPerRun / items.length, 2),
    totalCritical: totals.totalCritical
  };
}

function comparisonDelta(current, base, reverse = false) {
  const delta = roundMetric(current - base, 1);
  const isPositive = delta > 0;
  const isNegative = delta < 0;
  const better = reverse ? isNegative : isPositive;
  const className = better ? "completed" : isNegative || isPositive ? "abandoned" : "uncertain";
  const sign = delta > 0 ? "+" : "";
  return {
    text: `${sign}${delta}`,
    className
  };
}

function metricCard(label, value, caption) {
  return `
    <article class="metric-card">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value-row">
        <strong class="metric-value">${escapeHtml(value)}</strong>
      </div>
      <p class="metric-caption">${escapeHtml(caption)}</p>
    </article>
  `;
}

function evidenceClass(mode) {
  if (mode === "observed") return "completed";
  if (mode === "unknown") return "error";
  return "uncertain";
}

function messageTime(message) {
  return message.created_at ? formatShortDate(message.created_at) : "";
}

function definitionItem(label, value) {
  return `
    <div class="definition-item">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value || "Sin dato")}</dd>
    </div>
  `;
}

const HERO_AVATAR_PALETTE = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626", "#db2777", "#65a30d"];

function heroAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return HERO_AVATAR_PALETTE[Math.abs(hash) % HERO_AVATAR_PALETTE.length];
}

function heroInitials(name) {
  return String(name || "P")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function comparisonRow(label, currentText, peerText, delta, caption) {
  return `
    <article class="comparison-row">
      <div>
        <strong>${escapeHtml(label)}</strong>
        <p>${escapeHtml(caption)}</p>
      </div>
      <div class="comparison-row__values">
        <span class="pill">${escapeHtml(currentText)}</span>
        <span class="pill">Pool ${escapeHtml(peerText)}</span>
        <span class="status-pill ${delta.className}">${escapeHtml(delta.text)}</span>
      </div>
    </article>
  `;
}

function taskCapabilityPills(task) {
  return [
    `<span class="pill">Hasta ${task.max_steps} pasos</span>`,
    task.mcp_enabled ? '<span class="pill">Con apoyo MCP</span>' : "",
    task.predictive_attention_enabled ? '<span class="pill">Atención estimada</span>' : "",
    task.artifacts_enabled ? '<span class="pill">Guarda evidencia</span>' : ""
  ]
    .filter(Boolean)
    .join("");
}

function taskStatusLabel(status) {
  return status === "ready" ? "Lista" : status === "paused" ? "En pausa" : status || "Activa";
}

function renderTasks(tasks) {
  if (!tasks.length) {
    return emptyStateMarkup("Esta persona todavía no tiene tareas asociadas.");
  }

  return tasks
    .map(
      (task) => `
        <article class="list-card">
          <header>
            <div>
              <strong>${escapeHtml(task.prompt || "Tarea sin objetivo")}</strong>
              <p>${escapeHtml(labelTaskType(task.type))} · ${escapeHtml(task.success_criteria || "Sin señal de éxito definida")}</p>
            </div>
            <span class="tag">${escapeHtml(taskStatusLabel(task.status))}</span>
          </header>
          <div class="meta-row">
            ${taskCapabilityPills(task)}
          </div>
          ${task.url ? `<p>${escapeHtml(task.url)}</p>` : ""}
        </article>
      `
    )
    .join("");
}

function renderRoutes(runs) {
  const routeCounts = new Map();

  runs.forEach((run) => {
    const routeLabel = buildRouteLabel(run);
    routeCounts.set(routeLabel, (routeCounts.get(routeLabel) || 0) + 1);
  });

  if (!routeCounts.size) {
    return emptyStateMarkup("Todavía no hay rutas observadas para esta persona.");
  }

  const total = runs.length || 1;
  return [...routeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
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
}

function renderFindings(runs) {
  const findings = new Map();

  runs.forEach((run) => {
    (run.report_details?.prioritized_findings || []).forEach((finding) => {
      const key = `${finding.label}:${finding.severity}`;
      const current = findings.get(key) || { ...finding, count: 0 };
      current.count += 1;
      findings.set(key, current);
    });
  });

  if (!findings.size) {
    return emptyStateMarkup("Aún no hay hallazgos sintetizados para esta persona.");
  }

  return [...findings.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map(
      (finding) => `
        <article class="list-card">
          <header>
            <strong>${escapeHtml(finding.label)}</strong>
            <span class="status-pill ${severityToClass(finding.severity)}">${escapeHtml(finding.severity)}</span>
          </header>
          <p>${escapeHtml(finding.detail)}</p>
          <div class="meta-row"><span class="pill">${finding.count} repeticiones</span></div>
        </article>
      `
    )
    .join("");
}

function renderComparisonPanel(personaStats, peerStats, peerCount) {
  if (!personaStats.runCount) {
    return emptyStateMarkup("Necesitamos al menos un run de esta persona para compararla contra el proyecto.");
  }

  if (!peerCount) {
    return emptyStateMarkup("Aún no hay otras personas con runs en este proyecto para armar comparativas.");
  }

  return `
    <div class="comparison-grid">
      ${comparisonRow(
        "Success rate",
        `${personaStats.successRate}%`,
        `${peerStats.successRate}%`,
        comparisonDelta(personaStats.successRate, peerStats.successRate),
        "Qué tan seguido completa el objetivo frente al promedio del resto."
      )}
      ${comparisonRow(
        "Average steps",
        `${personaStats.avgSteps}`,
        `${peerStats.avgSteps}`,
        comparisonDelta(personaStats.avgSteps, peerStats.avgSteps, true),
        "Menos pasos suele indicar menor fricción operativa."
      )}
      ${comparisonRow(
        "Average time",
        `${personaStats.avgSeconds}s`,
        `${peerStats.avgSeconds}s`,
        comparisonDelta(personaStats.avgSeconds, peerStats.avgSeconds, true),
        "Tiempo promedio por corrida contra sus pares."
      )}
      ${comparisonRow(
        "Critical frictions / run",
        `${personaStats.criticalPerRun}`,
        `${peerStats.criticalPerRun}`,
        comparisonDelta(personaStats.criticalPerRun, peerStats.criticalPerRun, true),
        "Frecuencia de bloqueos críticos por run."
      )}
    </div>
  `;
}

function renderRankingPanel(projectPersonas, allRuns, currentPersonaId) {
  const ranking = projectPersonas
    .map((persona) => {
      const personaRuns = allRuns.filter((run) => run.persona_id === persona.id);
      return {
        persona,
        stats: computePersonaStats(personaRuns)
      };
    })
    .sort((a, b) => {
      if (b.stats.successRate !== a.stats.successRate) return b.stats.successRate - a.stats.successRate;
      if (b.stats.runCount !== a.stats.runCount) return b.stats.runCount - a.stats.runCount;
      return a.stats.avgSteps - b.stats.avgSteps;
    });

  if (!ranking.some((entry) => entry.stats.runCount)) {
    return emptyStateMarkup("Todavía no hay suficientes runs en el proyecto para ordenar arquetipos.");
  }

  return ranking
    .map((entry, index) => {
      const current = entry.persona.id === currentPersonaId ? " is-selected" : "";
      return `
        <article class="list-card list-card--interactive comparison-rank-card${current}" data-persona-id="${entry.persona.id}" role="button" tabindex="0" aria-label="Abrir ficha de ${escapeHtml(entry.persona.name)}">
          <header>
            <div>
              <strong>#${index + 1} · ${escapeHtml(entry.persona.name)}</strong>
              <p>${escapeHtml(entry.persona.segment || "Sin segmento")} · ${escapeHtml(entry.persona.role || "Sin rol")}</p>
            </div>
            <span class="tag">${entry.stats.runCount} runs</span>
          </header>
          <div class="meta-row">
            <span class="pill">${entry.stats.successRate}% success</span>
            <span class="pill">${entry.stats.avgSteps} pasos</span>
            <span class="pill">${entry.stats.avgSeconds}s</span>
            <span class="pill">${entry.stats.criticalPerRun} crit/run</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderConversationTabs(conversations, selectedConversationId) {
  if (!conversations.length) {
    return `<span class="pill">Sin chats guardados</span>`;
  }

  return conversations
    .map((thread) => {
      const active = thread.id === selectedConversationId ? " is-active" : "";
      const count = thread.messages?.length || 0;
      return `
        <button type="button" class="pill-button${active}" data-persona-detail-action="select-chat" data-id="${thread.id}">
          ${escapeHtml(thread.title || "Chat")} · ${count}
        </button>
      `;
    })
    .join("");
}

function renderAnchorOptions(runs, selectedRunId) {
  const options = [`<option value="">Sin run específico</option>`];
  runs.forEach((run) => {
    const task = getTaskById(run.task_id, getState());
    const label = `${formatShortDate(run.started_at)} · ${run.completion_status} · ${task ? task.prompt.slice(0, 56) : run.id}`;
    options.push(`<option value="${run.id}" ${run.id === selectedRunId ? "selected" : ""}>${escapeHtml(label)}</option>`);
  });
  return options.join("");
}

const VERDICT_META = {
  would_adopt: { label: "Lo adoptaría", className: "verdict-pill verdict-pill--adopt" },
  would_reject: { label: "No lo adoptaría", className: "verdict-pill verdict-pill--reject" },
  conditional: { label: "Depende de condiciones", className: "verdict-pill verdict-pill--conditional" },
  unclear: { label: "No me alcanza para decidir", className: "verdict-pill verdict-pill--unclear" }
};

function renderVerdictBlock(message) {
  if (!message.verdict) return "";
  const meta = VERDICT_META[message.verdict] || VERDICT_META.unclear;
  const conditions = Array.isArray(message.conditions) ? message.conditions : [];
  const frictions = Array.isArray(message.frictions) ? message.frictions : [];
  return `
    <div class="hypothesis-verdict">
      <span class="${meta.className}">${escapeHtml(meta.label)}</span>
      ${message.verdict_reason ? `<p class="hypothesis-verdict__reason">${escapeHtml(message.verdict_reason)}</p>` : ""}
      ${
        conditions.length
          ? `<div class="hypothesis-verdict__group"><strong>Condiciones</strong><ul>${conditions.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul></div>`
          : ""
      }
      ${
        frictions.length
          ? `<div class="hypothesis-verdict__group"><strong>Frenos</strong><ul>${frictions.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul></div>`
          : ""
      }
    </div>
  `;
}

function renderMessages(thread) {
  if (!thread || !thread.messages?.length) {
    const placeholder =
      thread?.kind === "hypothesis"
        ? "Plantea una hipótesis concreta (ej: '¿Comprarías esto a $40 al mes?'). La persona responde con un veredicto."
        : "Escribe una pregunta para que responda desde su perfil, historial y contexto.";
    return emptyStateMarkup(placeholder);
  }

  const isHypothesisThread = thread.kind === "hypothesis";
  const showEvidenceMetadata = !isHypothesisThread && thread.mode === "evidence";

  return thread.messages
    .map((message) => {
      const personaMessage = message.role === "persona";
      const citations = message.citations || { run_ids: [], task_ids: [] };
      return `
        <article class="chat-message ${personaMessage ? "chat-message--persona" : "chat-message--user"}">
          <div class="chat-message__meta">
            <strong>${personaMessage ? "Persona" : "Tú"}</strong>
            ${
              showEvidenceMetadata && message.evidence_mode
                ? `<span class="status-pill ${evidenceClass(message.evidence_mode)}">${escapeHtml(message.evidence_mode)}</span>`
                : ""
            }
            ${messageTime(message) ? `<span class="pill">${messageTime(message)}</span>` : ""}
          </div>
          ${isHypothesisThread && personaMessage ? renderVerdictBlock(message) : ""}
          <p>${escapeHtml(message.content)}</p>
          ${
            showEvidenceMetadata && personaMessage && (citations.run_ids?.length || citations.task_ids?.length || message.reasoning_note)
              ? `
                <div class="chat-message__evidence">
                  ${message.reasoning_note ? `<span class="pill">${escapeHtml(message.reasoning_note)}</span>` : ""}
                  ${(citations.run_ids || []).map((id) => `<span class="pill">run ${escapeHtml(id)}</span>`).join("")}
                  ${(citations.task_ids || []).map((id) => `<span class="pill">task ${escapeHtml(id)}</span>`).join("")}
                </div>
              `
              : ""
          }
        </article>
      `;
    })
    .join("");
}

export function renderPersonaChat({ conversations, selectedThread, runs, ui, mode }) {
  const selectedMode = selectedThread?.mode || ui.personaChatMode || "free";
  const selectedAnchor = selectedThread?.anchor_run_id || ui.personaChatAnchorRunId || "";
  const isHypothesis = mode === "hypothesis";
  const title = isHypothesis ? "Validar hipótesis" : "Conversar con la persona";
  const eyebrow = isHypothesis ? "Hipótesis" : "Chat";
  const newChatLabel = isHypothesis ? "Nueva hipótesis" : "Nuevo chat";
  const newChatAction = isHypothesis ? "new-hypothesis" : "new-chat";
  return `
    <article class="panel persona-chat-panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">${eyebrow}</p>
          <h3>${title}</h3>
        </div>
        <div class="persona-chat-actions">
          ${renderConversationTabs(conversations, selectedThread?.id || null)}
          <button type="button" class="ghost-button" data-persona-detail-action="${newChatAction}">${newChatLabel}</button>
        </div>
      </div>

      <div class="persona-chat-layout">
        <div class="persona-chat-thread">
          ${renderMessages(selectedThread)}
        </div>
        <form id="persona-chat-form" class="persona-chat-form">
          ${
            isHypothesis
              ? `<input type="hidden" name="mode" value="free" />`
              : `
                <div class="filters-grid persona-chat-controls">
                  <label>
                    Modo
                    <select name="mode">
                      <option value="free" ${selectedMode === "free" ? "selected" : ""}>Conversar con la persona</option>
                      <option value="evidence" ${selectedMode === "evidence" ? "selected" : ""}>Preguntar sobre evidencia</option>
                    </select>
                  </label>
                  <label>
                    Run de referencia
                    <select name="anchorRunId">
                      ${renderAnchorOptions(runs, selectedAnchor)}
                    </select>
                  </label>
                </div>
              `
          }
          <label>
            ${isHypothesis ? "Hipótesis" : "Mensaje"}
            <textarea name="content" rows="3" placeholder="${
              isHypothesis
                ? "Plantea una hipótesis concreta. Ej: ¿Comprarías esto a $40 al mes?, ¿Usarías esta feature si te ahorra 15 min por día?"
                : "Pregúntale qué piensa, qué espera o qué le incomoda..."
            }" ${ui.personaChatBusy ? "disabled" : ""} required></textarea>
          </label>
          <div class="form-actions">
            <button type="submit" ${ui.personaChatBusy ? "disabled" : ""}>${
              ui.personaChatBusy
                ? isHypothesis
                  ? "Evaluando..."
                  : "Respondiendo..."
                : isHypothesis
                  ? "Evaluar hipótesis"
                  : "Enviar"
            }</button>
          </div>
        </form>
      </div>
    </article>
  `;
}

function renderRunHistory(runs) {
  if (!runs.length) {
    return emptyStateMarkup("Esta persona todavía no tiene runs registrados.");
  }

  return runs
    .map((run, index) => {
      const task = getTaskById(run.task_id, getState());
      const screenshots = run.screenshots || [];
      const findings = run.report_details?.prioritized_findings || [];
      const followUps = run.follow_up_questions || [];

      return `
        <details class="persona-run-entry"${index === 0 ? " open" : ""}>
          <summary class="persona-run-entry__summary">
            <div>
              <strong>${escapeHtml(task ? task.prompt : "Task eliminada")}</strong>
              <p>${escapeHtml(run.report_summary || "Sin resumen")} </p>
            </div>
            <div class="meta-row">
              <span class="status-pill ${statusClass(run.completion_status)}">${escapeHtml(run.completion_status)}</span>
              <span class="pill">${formatShortDate(run.started_at)}</span>
            </div>
          </summary>
          <div class="persona-run-entry__body">
            <div class="meta-row">
              <span class="pill">${escapeHtml(run.engine || "simulated")}</span>
              <span class="pill">${run.step_log?.length || 0} pasos</span>
              <span class="pill">${run.click_points?.length || 0} clicks</span>
              <span class="pill">${escapeHtml(buildRouteLabel(run))}</span>
            </div>
            ${run.execution_notes ? `<p>${escapeHtml(run.execution_notes)}</p>` : ""}
            ${
              followUps.length
                ? `<div class="meta-row">${followUps.map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("")}</div>`
                : ""
            }
            ${
              screenshots.length
                ? `
                  <div class="screens-grid">
                    ${screenshots
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
                `
                : ""
            }
            ${
              run.step_log?.length
                ? `
                  <div class="timeline">
                    ${run.step_log
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
                `
                : ""
            }
            ${
              findings.length
                ? `
                  <div class="timeline">
                    ${findings
                      .map(
                        (finding) => `
                          <div class="timeline-entry">
                            <strong>${escapeHtml(finding.label)}</strong>
                            <p>${escapeHtml(finding.detail)}</p>
                            <span class="status-pill ${severityToClass(finding.severity)}">${escapeHtml(finding.severity)}</span>
                          </div>
                        `
                      )
                      .join("")}
                  </div>
                `
                : ""
            }
          </div>
        </details>
      `;
    })
    .join("");
}

export function renderPersonaDetail() {
  const state = getState();
  const ui = getUi();
  const container = document.getElementById("persona-detail-content");

  if (!container) {
    return;
  }

  const persona = getPersonaById(ui.personaDetailId, state);

  if (!persona) {
    container.innerHTML = emptyStateMarkup("Selecciona una persona para ver su ficha completa.");
    return;
  }

  const tasks = (state.tasks || []).filter((task) => task.persona_id === persona.id);
  const runs = (state.runs || [])
    .filter((run) => run.persona_id === persona.id)
    .sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0));
  // Comparativas globales: usamos todas las personas activas del pool.
  const projectPersonas = (state.personas || []).filter((p) => p.status !== "archived");
  const projectRuns = state.runs || [];
  const conversations = (state.persona_conversations || [])
    .filter((thread) => thread.persona_id === persona.id)
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));

  if (ui.selectedConversationId && !conversations.some((thread) => thread.id === ui.selectedConversationId)) {
    ui.selectedConversationId = null;
  }
  if (!ui.selectedConversationId && conversations[0]) {
    ui.selectedConversationId = conversations[0].id;
  }
  const selectedThread = conversations.find((thread) => thread.id === ui.selectedConversationId) || null;

  const personaStats = computePersonaStats(runs);
  const peerStatsSource = projectPersonas
    .filter((entry) => entry.id !== persona.id)
    .map((entry) => computePersonaStats(projectRuns.filter((run) => run.persona_id === entry.id)))
    .filter((entry) => entry.runCount > 0);
  const peerStats = averageStats(peerStatsSource);
  const totalSteps = runs.reduce((sum, run) => sum + (run.step_log?.length || 0), 0);
  const lastRun = runs[0];

  const activeTab = ui.personaDetailTab || "perfil";
  const tabs = [
    { id: "perfil", label: "Perfil" },
    { id: "tareas", label: "Tareas" },
    { id: "actividad", label: "Actividad" }
  ];

  const tabsHtml = `
    <div class="persona-detail-tabs" role="tablist">
      ${tabs
        .map(
          (tab) => `
            <button type="button" class="pill-button${tab.id === activeTab ? " is-active" : ""}" role="tab" data-persona-tab="${tab.id}" aria-selected="${tab.id === activeTab}">${escapeHtml(tab.label)}</button>
          `
        )
        .join("")}
    </div>
  `;

  const perfilPanel = `
    <div class="metrics-grid">
      ${metricCard("Tasks asociadas", String(tasks.length), "Tareas definidas para este arquetipo")}
      ${metricCard("Runs", String(runs.length), "Corridas registradas para esta persona")}
      ${metricCard("Completion rate", `${personaStats.successRate}%`, "Corridas completadas sobre el total")}
      ${metricCard("Ultima actividad", lastRun ? formatShortDate(lastRun.started_at) : "N/A", "Fecha del run más reciente")}
      ${metricCard("Pasos observados", String(totalSteps), "Suma de pasos registrados en runs")}
    </div>

    <div class="panel-grid persona-detail-top-grid">
      <article class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Perfil</p>
            <h3>Contexto operativo</h3>
          </div>
        </div>
        <dl class="definition-grid">
          ${definitionItem("Contexto funcional", persona.functional_context)}
          ${definitionItem("Contexto de uso", persona.usage_context)}
          ${definitionItem("Metas", persona.goals)}
          ${definitionItem("Motivaciones", persona.motivations)}
          ${definitionItem("Necesidades", persona.needs)}
          ${definitionItem("Comportamientos", persona.behaviors)}
        </dl>
      </article>

      <article class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Limitantes</p>
            <h3>Riesgos y herramientas</h3>
          </div>
        </div>
        <dl class="definition-grid">
          ${definitionItem("Dolores", persona.pains)}
          ${definitionItem("Frenos", persona.frictions)}
          ${definitionItem("Rasgos", persona.personality_traits)}
          ${definitionItem("Entorno digital", persona.digital_environment)}
          ${definitionItem("Comportamiento digital", persona.digital_behavior)}
          ${definitionItem("Dispositivos", persona.devices)}
          ${definitionItem("Apps usadas", persona.apps_used)}
          ${definitionItem("Restricciones", persona.restrictions)}
          ${definitionItem("Adjuntos", persona.attachments)}
        </dl>
      </article>
    </div>

    <article class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Metadata</p>
          <h3>Versionado y contexto</h3>
        </div>
      </div>
      <dl class="definition-grid">
        ${definitionItem("Creada", formatShortDate(persona.created_at))}
        ${definitionItem("Actualizada", formatShortDate(persona.updated_at))}
        ${definitionItem("Estado", persona.status)}
        ${definitionItem("Nivel digital", labelDigitalLevel(persona.digital_level))}
      </dl>
    </article>
  `;

  const tareasPanel = `
    <article class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Tareas asignadas</p>
          <h3>Todo lo que tiene asignado</h3>
        </div>
      </div>
      <div class="stacked-list">${renderTasks(tasks)}</div>
    </article>
  `;

  const actividadPanel = `
    <div class="panel-grid persona-detail-activity-grid">
      <article class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Observed</p>
            <h3>Rutas que navegó</h3>
          </div>
        </div>
        <div class="stacked-list">${renderRoutes(runs)}</div>
      </article>

      <article class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Inferred</p>
            <h3>Hallazgos frecuentes</h3>
          </div>
        </div>
        <div class="stacked-list">${renderFindings(runs)}</div>
      </article>
    </div>

    <article class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Ranking</p>
          <h3>Arquetipos comparados</h3>
        </div>
      </div>
      <div class="stacked-list">${renderRankingPanel(projectPersonas, projectRuns, persona.id)}</div>
    </article>

    <article class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Historial</p>
          <h3>Todo lo que hizo y navegó</h3>
        </div>
      </div>
      <div class="persona-run-list">${renderRunHistory(runs)}</div>
    </article>
  `;

  const tabPanel =
    activeTab === "tareas" ? tareasPanel : activeTab === "actividad" ? actividadPanel : perfilPanel;

  const avatarColor = heroAvatarColor(persona.name || "?");
  const avatarInitials = heroInitials(persona.name);

  container.innerHTML = `
    <div class="persona-detail-shell">
      <div class="hero-card persona-detail-hero">
        <div class="persona-detail-hero__main">
          <div class="persona-detail-hero__avatar" style="background:${avatarColor}">${avatarInitials}</div>
          <div class="persona-detail-hero__body">
            <p class="eyebrow">Ficha de persona</p>
            <h3>${escapeHtml(persona.name)}</h3>
            <p>${escapeHtml(persona.description || persona.usage_context || "Sin descripcion")}</p>
            <div class="meta-row">
              <span class="tag">${escapeHtml(persona.status || "active")}</span>
              <span class="pill">${escapeHtml(persona.segment || "Sin segmento")}</span>
              <span class="pill">${escapeHtml(persona.role || "Sin rol")}</span>
              <span class="pill">${labelDigitalLevel(persona.digital_level)}</span>
              <span class="pill">v${persona.version || 1}</span>
            </div>
          </div>
        </div>
        <div class="persona-detail-actions">
          <button type="button" class="ghost-button" data-persona-detail-action="back">Volver a personas</button>
          <button type="button" class="ghost-button" data-action="open-chat" data-persona-id="${persona.id}">Conversar</button>
          <button type="button" class="ghost-button" data-action="open-hypothesis" data-persona-id="${persona.id}">Validar hipótesis</button>
          <button type="button" data-persona-detail-action="edit" data-id="${persona.id}">Editar persona</button>
        </div>
      </div>

      ${tabsHtml}
      <div class="persona-detail-tab-panel">${tabPanel}</div>
    </div>
  `;
}
