const UNKNOWN_PATTERNS = [
    "competencia",
    "mercado",
    "legal",
    "regulacion",
    "regulación",
    "ingresos",
    "ventas",
    "forecast"
];
function asText(value) {
    return String(value || "").trim();
}
function compactJoin(items) {
    return items.map(asText).filter(Boolean).join(" ");
}
function cleanSentence(value) {
    return asText(value)
        .replace(/\b(del\s+)?segmento\s+[^.,;]+/gi, "")
        .replace(/\bprofesional comercial\b/gi, "")
        .replace(/\b(rol|arquetipo|nivel digital)\s*[:=-]?\s*/gi, "")
        .replace(/\s+/g, " ")
        .replace(/\s+([.,;:])/g, "$1")
        .replace(/^[,.;:\s]+/g, "")
        .trim()
        .replace(/[.]+$/g, "");
}
function sentenceCase(value) {
    const text = asText(value);
    return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : "";
}
function descriptionFragment(value) {
    const cleaned = cleanSentence(value);
    if (!cleaned)
        return "";
    const firstPerson = cleaned
        .replace(/^tiene\b/i, "tengo")
        .replace(/^necesita\b/i, "necesito")
        .replace(/^usa\b/i, "uso")
        .replace(/^busca\b/i, "busco")
        .replace(/^trabaja\b/i, "trabajo")
        .replace(/^vive\b/i, "vivo")
        .replace(/^es\b/i, "soy");
    if (firstPerson === cleaned && /^[a-záéíóúñ]+[ao]\b/i.test(firstPerson)) {
        return `soy ${firstPerson.toLowerCase()}`;
    }
    return firstPerson;
}
function getAnchoredRun(runs, anchorRunId) {
    if (!anchorRunId)
        return null;
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
function statusLabel(status) {
    if (status === "completed")
        return "pude terminar";
    if (status === "abandoned")
        return "lo dejé antes de terminar";
    if (status === "blocked")
        return "me quedé bloqueado";
    if (status === "uncertain")
        return "no me quedó del todo claro";
    return "tuve una experiencia mixta";
}
function summarizeRun(run, tasks) {
    if (!run)
        return "";
    const task = (tasks || []).find((item) => item.id === run.task_id);
    const steps = (run.step_log || [])
        .slice(0, 2)
        .map((step) => cleanSentence(`${step.action} en ${step.screen}`))
        .filter(Boolean)
        .join("; ");
    const findings = (run.report_details?.prioritized_findings || [])
        .slice(0, 2)
        .map((finding) => finding.label)
        .join(", ");
    return compactJoin([
        task ? `Cuando intenté "${cleanSentence(task.prompt)}",` : "En ese recorrido,",
        `${statusLabel(run.completion_status)}.`,
        steps ? `Primero pasé por ${steps}.` : "",
        findings ? `Lo que más me pesó fue ${cleanSentence(findings)}.` : "",
        cleanSentence(run.report_summary) ? `${cleanSentence(run.report_summary)}.` : ""
    ]);
}
function inferFromPersona(persona) {
    const demographicParts = [persona.age, persona.gender, persona.life_context].filter(Boolean);
    return [
        demographicParts.length ? `tengo ${demographicParts.join(", ")}` : "",
        descriptionFragment(persona.description),
        persona.usage_context ? `suelo resolver esto en momentos como ${cleanSentence(persona.usage_context).toLowerCase()}` : "",
        persona.goals ? `quiero ${cleanSentence(persona.goals).toLowerCase()}` : "",
        persona.needs ? `necesito ${cleanSentence(persona.needs).toLowerCase()}` : "",
        persona.frictions ? `me frena ${cleanSentence(persona.frictions).toLowerCase()}` : "",
        persona.digital_behavior ? `uso lo digital así: ${cleanSentence(persona.digital_behavior).toLowerCase()}` : ""
    ].filter(Boolean);
}
function profileLine(persona) {
    const context = inferFromPersona(persona).slice(0, 2);
    if (!context.length) {
        return "Para mí, la claridad y la confianza pesan mucho antes de decidir.";
    }
    return `${sentenceCase(context.join("; "))}.`;
}
function followUpQuestion(message) {
    const normalized = asText(message).toLowerCase();
    if (normalized.includes("piens") || normalized.includes("opini") || normalized.includes("parece")) {
        return "¿Quieres que te diga qué me haría confiar más?";
    }
    if (normalized.includes("esper") || normalized.includes("necesit") || normalized.includes("quier")) {
        return "¿Te cuento qué esperaría ver primero para sentirme cómodo?";
    }
    if (normalized.includes("molest") || normalized.includes("fric") || normalized.includes("duele") || normalized.includes("problema")) {
        return "¿Quieres que te cuente dónde probablemente me trabaría?";
    }
    return "¿Quieres que lo piense desde una situación más concreta?";
}
function conversationalReply(persona, message) {
    const normalized = asText(message).toLowerCase();
    const background = profileLine(persona);
    if (normalized.includes("piens") || normalized.includes("opini") || normalized.includes("parece")) {
        return `Lo pensaría desde algo bastante simple: si me ayuda a avanzar sin hacerme perder tiempo, me interesa. ${background} Si la experiencia se siente clara y no me obliga a adivinar, probablemente le daría una oportunidad. ${followUpQuestion(message)}`;
    }
    if (normalized.includes("esper") || normalized.includes("necesit") || normalized.includes("quier")) {
        return `Yo esperaría que la experiencia fuera directa y fácil de retomar. ${background} Necesito sentir que entiende mi situación sin pedirme demasiadas vueltas. ${followUpQuestion(message)}`;
    }
    if (normalized.includes("molest") || normalized.includes("fric") || normalized.includes("duele") || normalized.includes("problema")) {
        return `Lo que más me incomodaría es sentir que pierdo el control o que tengo que interpretar demasiado. ${background} Cuando eso pasa, suelo frenar, revisar dos veces o dejarlo para después. ${followUpQuestion(message)}`;
    }
    return `Yo lo bajaría a algo muy concreto: necesito entender rápido si esto me ayuda o me complica. ${background} Si me da claridad y respeta mis límites, puedo seguir; si no, necesito más señales antes de confiar. ${followUpQuestion(message)}`;
}
function inferLocalHypothesisVerdict(persona, message) {
    const normalized = asText(message).toLowerCase();
    const frictionsText = asText(persona.frictions).toLowerCase();
    const painsText = asText(persona.pains).toLowerCase();
    const mentionsPrice = /(\$|precio|costo|pago|cobr|caro|barato|usd|cl\$|mxn)/i.test(normalized);
    const asksAdoption = /(comprar|usar|adopt|probar|suscrib|registr|aceptar)/i.test(normalized);
    if (mentionsPrice && /confian|costo|precio|sorpresa|claridad/.test(frictionsText + " " + painsText)) {
        return {
            verdict: "conditional",
            verdict_reason: "Necesito ver el costo total claro antes de decidir.",
            conditions: ["Costos transparentes desde el principio", "Posibilidad de probar sin compromiso"],
            frictions: ["Sorpresas en el precio final", "Falta de claridad en lo que incluye"]
        };
    }
    if (asksAdoption && persona.digital_level === "low") {
        return {
            verdict: "conditional",
            verdict_reason: "Lo probaría solo si me lo explican muy paso a paso.",
            conditions: ["Onboarding muy guiado", "Soporte humano accesible"],
            frictions: ["No quiero perder tiempo configurando algo que no entiendo"]
        };
    }
    if (asksAdoption) {
        return {
            verdict: "conditional",
            verdict_reason: "Depende de cómo encaja con lo que hago día a día.",
            conditions: ["Que me ahorre pasos reales", "Que no me obligue a aprender otra herramienta"],
            frictions: ["Otra app más para mantener"]
        };
    }
    return {
        verdict: "unclear",
        verdict_reason: "Con lo que me cuentas no me alcanza para decidir.",
        conditions: [],
        frictions: ["No tengo suficiente información para evaluarlo bien"]
    };
}
export function buildLocalPersonaReply({ persona, tasks = [], runs = [], message = "", mode = "free", anchorRunId = null, kind = "chat" }) {
    const anchoredRun = getAnchoredRun(runs, anchorRunId);
    const latestRun = runs[0] || null;
    const evidenceRun = anchoredRun || (hasEvidenceSignal(message) ? latestRun : null);
    if (kind === "hypothesis") {
        const verdictData = inferLocalHypothesisVerdict(persona, message);
        const profile = profileLine(persona);
        const reply = `${verdictData.verdict_reason} ${profile} ${verdictData.conditions.length ? "Lo aceptaría si se cumple algo concreto." : "¿Puedes ser más específico?"}`;
        return {
            reply: reply.trim(),
            evidence_mode: "inferred",
            reasoning_note: "Veredicto inferido localmente desde el perfil de la persona (sin LLM).",
            citations: { run_ids: [], task_ids: [] },
            ...verdictData
        };
    }
    if (asksOutsideContext(message) && !evidenceRun) {
        return {
            reply: "No puedo saber eso con precisión con lo que tengo a mano. Te puedo decir cómo lo miraría desde mi experiencia y qué señales necesitaría para confiar. ¿Quieres que lo piense desde una situación concreta?",
            evidence_mode: "unknown",
            reasoning_note: "La pregunta parece pedir información fuera del perfil y sin evidencia observada asociada.",
            citations: { run_ids: [], task_ids: [] }
        };
    }
    if ((mode === "evidence" || evidenceRun) && evidenceRun) {
        return {
            reply: `${summarizeRun(evidenceRun, tasks)} Si me preguntas por esa experiencia, lo más importante para mí fue entender rápido qué estaba pasando y sentir que el siguiente paso era confiable.`,
            evidence_mode: "observed",
            reasoning_note: "Respuesta basada en un run registrado de la persona.",
            citations: { run_ids: [evidenceRun.id], task_ids: evidenceRun.task_id ? [evidenceRun.task_id] : [] }
        };
    }
    return {
        reply: conversationalReply(persona, message),
        evidence_mode: "inferred",
        reasoning_note: "Respuesta conversacional construida desde el perfil de la persona.",
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
