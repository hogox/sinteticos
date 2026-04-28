const UNKNOWN_PATTERNS = [
  "precio",
  "competencia",
  "mercado",
  "legal",
  "regulacion",
  "regulación",
  "ingresos",
  "ventas",
  "futuro",
  "forecast"
];

function asText(value) {
  return String(value || "").trim();
}

function compactJoin(items) {
  return items.map(asText).filter(Boolean).join(" ");
}

function getAnchoredRun(runs, anchorRunId) {
  if (!anchorRunId) return null;
  return (runs || []).find((run) => run.id === anchorRunId) || null;
}

function hasEvidenceSignal(message) {
  const normalized = asText(message).toLowerCase();
  return ["run", "corrida", "naveg", "click", "paso", "pantalla", "frustr", "aband", "hice", "vi"].some((token) => normalized.includes(token));
}

function asksOutsideContext(message) {
  const normalized = asText(message).toLowerCase();
  return UNKNOWN_PATTERNS.some((token) => normalized.includes(token));
}

function summarizeRun(run, tasks) {
  if (!run) return "";
  const task = (tasks || []).find((item) => item.id === run.task_id);
  const steps = (run.step_log || []).slice(0, 3).map((step) => `${step.action} en ${step.screen}`).join("; ");
  const findings = (run.report_details?.prioritized_findings || []).slice(0, 2).map((finding) => finding.label).join(", ");
  return compactJoin([
    task ? `Cuando intenté "${task.prompt}",` : "En ese recorrido,",
    `terminé con estado ${run.completion_status}.`,
    steps ? `Mis primeros pasos fueron: ${steps}.` : "",
    findings ? `Lo que más pesó fue: ${findings}.` : "",
    run.report_summary || ""
  ]);
}

function inferFromPersona(persona) {
  return compactJoin([
    persona.description,
    persona.usage_context ? `Normalmente uso esto en este contexto: ${persona.usage_context}.` : "",
    persona.needs ? `Necesito ${persona.needs}.` : "",
    persona.frictions ? `Me frena ${persona.frictions}.` : "",
    persona.digital_behavior ? `Mi patrón digital es: ${persona.digital_behavior}.` : ""
  ]);
}

export function buildLocalPersonaReply({ persona, tasks = [], runs = [], message = "", mode = "free", anchorRunId = null }) {
  const anchoredRun = getAnchoredRun(runs, anchorRunId);
  const latestRun = runs[0] || null;
  const evidenceRun = anchoredRun || (hasEvidenceSignal(message) ? latestRun : null);

  if (asksOutsideContext(message) && !evidenceRun) {
    return {
      reply:
        "No tengo suficiente información en mi perfil ni en mis recorridos registrados para responder eso con precisión. Puedo hablar de mi contexto, mis fricciones y lo que hice en los runs disponibles.",
      evidence_mode: "unknown",
      reasoning_note: "La pregunta parece pedir información fuera del perfil y sin evidencia observada asociada.",
      citations: { run_ids: [], task_ids: [] }
    };
  }

  if ((mode === "evidence" || evidenceRun) && evidenceRun) {
    return {
      reply: `Yo lo viví desde mi rol de ${persona.role || "usuario"}. ${summarizeRun(evidenceRun, tasks)} Si me preguntas por esa experiencia, lo más importante para mí fue entender rápido qué estaba pasando y sentir que el siguiente paso era confiable.`,
      evidence_mode: "observed",
      reasoning_note: "Respuesta basada en un run registrado de la persona.",
      citations: { run_ids: [evidenceRun.id], task_ids: evidenceRun.task_id ? [evidenceRun.task_id] : [] }
    };
  }

  return {
    reply: `Yo respondería desde mi contexto como ${persona.role || "usuario"} del segmento ${persona.segment || "definido"}. ${inferFromPersona(persona)} Esto es una lectura desde mi perfil, no algo que haya observado directamente en un recorrido específico.`,
    evidence_mode: "inferred",
    reasoning_note: "Respuesta construida desde el perfil de la persona, sin afirmar una acción observada nueva.",
    citations: { run_ids: [], task_ids: [] }
  };
}

export function buildPersonaChatContext({ persona, project, tasks = [], runs = [], anchorRunId = null, history = [] }) {
  const anchoredRun = getAnchoredRun(runs, anchorRunId);
  return {
    project: project ? { id: project.id, name: project.name, description: project.description } : null,
    persona,
    tasks: tasks.map((task) => ({
      id: task.id,
      type: task.type,
      prompt: task.prompt,
      success_criteria: task.success_criteria,
      status: task.status
    })),
    runs: runs.slice(0, 8).map((run) => ({
      id: run.id,
      task_id: run.task_id,
      completion_status: run.completion_status,
      report_summary: run.report_summary,
      steps: (run.step_log || []).slice(0, 6),
      findings: (run.report_details?.prioritized_findings || []).slice(0, 5)
    })),
    anchor_run: anchoredRun ? anchoredRun.id : null,
    recent_messages: history.slice(-8).map((message) => ({
      role: message.role,
      content: message.content,
      evidence_mode: message.evidence_mode || null
    }))
  };
}
