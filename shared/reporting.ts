interface RepPersona {
  name?: string;
  role?: string;
  segment?: string;
  digital_level?: string;
  [k: string]: unknown;
}

interface RepTask {
  type?: string;
  prompt?: string;
  success_criteria?: string;
  [k: string]: unknown;
}

export interface Finding {
  label: string;
  severity: "low" | "medium" | "high" | "critical";
  detail: string;
  priority?: number;
  framework_citation?: string;
}

interface StepLogEntry {
  step?: number;
  screen?: string;
  action?: string;
  certainty?: number;
  connectedCount?: number;
  candidateCount?: number;
  [k: string]: unknown;
}

interface ScreenTransition {
  from: string;
  to: string;
  step: number;
}

interface CoverageData {
  totalCandidates?: number;
  totalConnected?: number;
  coverageRatio?: number;
  fallbackSteps?: number;
  retriedSteps?: number;
  retriedSuccessfully?: number;
  totalRetryAttempts?: number;
  stepLog?: StepLogEntry[];
  screenTransitions?: ScreenTransition[];
}

export function composeStepReason(persona: RepPersona, task: RepTask, action: string, screen: string, certainty: number): string {
  const behavior =
    persona.digital_level === "high"
      ? "necesito control y senales claras"
      : persona.digital_level === "low"
      ? "necesito pasos mas guiados y familiares"
      : "necesito claridad suficiente para seguir sin friccion";
  return `En ${screen}, tome la accion ${action} porque ${behavior} y percibi una certeza de ${certainty}% frente al objetivo: ${(task.prompt || "").toLowerCase()}.`;
}

export function composePersonaResponse(
  persona: RepPersona,
  task: RepTask,
  status: string,
  findings: Finding[],
  stepCount: number
): string {
  const intro = `Yo llegue a esta prueba como ${persona.role || "usuario"} ${persona.segment ? `del segmento ${persona.segment}` : ""} y trate de ${(task.prompt || "").toLowerCase()}.`;
  const understanding =
    task.type === "navigation"
      ? `Lo primero que entendi fue que tenia que recorrer un flujo con ${stepCount} pasos aproximados y fijarme rapido si podia avanzar sin sentirme perdido.`
      : "Lo primero que hice fue reaccionar desde mi contexto real y no desde una mirada experta del producto.";
  const friction = findings[0]
    ? `Lo que mas me freno fue ${findings[0].label.toLowerCase()}: ${findings[0].detail.toLowerCase()}.`
    : "No tengo suficiente informacion en mi perfil para responder eso con precision.";
  const confidence =
    status === "completed"
      ? "Segui porque el flujo me dio senales suficientes de control y continuidad."
      : "No llegue a sentir suficiente certeza para seguir con confianza.";
  const next =
    status === "abandoned" || status === "error"
      ? "Si esto me pasara en un uso real, probablemente lo dejaria para mas tarde o buscaria otra alternativa."
      : "Despues de esto seguiria evaluando si el flujo realmente vale el esfuerzo que me pide.";
  return `${intro} ${understanding} ${friction} ${confidence} ${next}`;
}

export function summarizeRun(task: RepTask, persona: RepPersona, status: string, findings: Finding[]): string {
  const severity = findings[0] ? findings[0].severity : "medium";
  return `${persona.name} termino el task ${task.type} como ${status} con una friccion ${severity} centrada en ${findings[0] ? findings[0].label.toLowerCase() : "claridad general"}.`;
}

function evaluateStepEfficiency(
  stepLog: StepLogEntry[] | undefined,
  screenTransitions: ScreenTransition[] | undefined,
  status: string
): Finding | null {
  const totalSteps = (stepLog || []).length;
  if (totalSteps === 0) return null;
  const backSteps = (stepLog || []).filter((s) => s.action === "back").length;
  const scrollSteps = (stepLog || []).filter((s) => s.action === "scroll").length;
  const productiveSteps = Math.max(1, totalSteps - backSteps - scrollSteps);
  const transitions = (screenTransitions || []).length;
  const efficiency = transitions > 0 ? transitions / productiveSteps : 0;

  if (status === "completed") {
    if (totalSteps <= 3 && transitions >= 2) {
      return {
        label: "Recorrido muy eficiente",
        severity: "low",
        detail: `Completó la tarea en ${totalSteps} paso(s) con ${transitions} transición(es) reales. El flujo principal se entiende rápido y no hay vueltas.`,
        priority: 30
      };
    }
    if (backSteps >= 2 || (transitions > 0 && efficiency < 0.5)) {
      return {
        label: "Recorrido con vueltas innecesarias",
        severity: "medium",
        detail: `Completó la tarea en ${totalSteps} paso(s) pero solo ${transitions} fueron transiciones útiles (${backSteps} retroceso(s), ${scrollSteps} scroll(s)). Podría completarse con menos pasos si la navegación principal fuera más clara.`,
        priority: 60
      };
    }
    if (totalSteps >= 8) {
      return {
        label: "Recorrido largo para el objetivo",
        severity: "medium",
        detail: `Tomó ${totalSteps} paso(s) para llegar al objetivo. El flujo se siente extendido — vale revisar si hay atajos o pantallas intermedias evitables.`,
        priority: 55
      };
    }
    return {
      label: "Recorrido razonable",
      severity: "low",
      detail: `${totalSteps} paso(s) / ${transitions} transición(es). El esfuerzo es aceptable pero no destaca como óptimo.`,
      priority: 25
    };
  }

  if (status === "abandoned" || status === "uncertain") {
    if (totalSteps >= 6 && transitions <= 1) {
      return {
        label: "Esfuerzo alto sin avance",
        severity: "high",
        detail: `Invirtió ${totalSteps} paso(s) y solo logró ${transitions} transición(es) reales antes de quedar sin certeza. El flujo no entrega progreso visible.`,
        priority: 65
      };
    }
    return null;
  }
  return null;
}

export function buildFindings(
  task: RepTask,
  persona: RepPersona,
  status: string,
  rng: () => number,
  coverageData: CoverageData = {}
): Finding[] {
  const findings: Finding[] = [
    {
      label: "Claridad del siguiente paso",
      severity: status === "abandoned" || status === "error" ? "critical" : "high",
      detail:
        persona.digital_level === "low"
          ? "El usuario necesita pasos mucho mas secuenciales para no perder confianza."
          : "El flujo muestra ambiguedad cuando intenta seguir a la siguiente pantalla."
    },
    {
      label: "Confianza en la accion principal",
      severity: status === "completed" ? "medium" : "high",
      detail:
        task.type === "navigation"
          ? "La llamada principal existe, pero no siempre parece suficientemente explicita."
          : "La propuesta genera interes, aunque todavia hay dudas sobre el riesgo y la conveniencia."
    },
    {
      label: "Carga cognitiva",
      severity: rng() > 0.58 ? "medium" : "low",
      detail: "Hay demasiadas decisiones simultaneas para un contexto de uso rapido o cansado."
    }
  ];

  const {
    totalCandidates,
    totalConnected,
    coverageRatio,
    fallbackSteps,
    retriedSteps,
    retriedSuccessfully = 0,
    totalRetryAttempts = 0,
    stepLog = [],
    screenTransitions = []
  } = coverageData;

  if (totalCandidates && totalCandidates > 3 && coverageRatio !== undefined) {
    if (coverageRatio < 0.3) {
      findings.push({
        label: "Prototipo con baja cobertura de transiciones",
        severity: "high",
        detail: `Solo ${Math.round(coverageRatio * 100)}% de los elementos interactivos detectados tienen conexiones de prototipo definidas (${totalConnected} de ${totalCandidates}). Esto puede dejar al usuario "atrapado" en pantallas sin salidas claras.`,
        priority: 75
      });
    } else if (coverageRatio < 0.6) {
      findings.push({
        label: "Cobertura parcial de transiciones",
        severity: "medium",
        detail: `El ${Math.round(coverageRatio * 100)}% de los elementos interactivos tienen conexiones definidas (${totalConnected} de ${totalCandidates}). El prototipo podria ser mas completo en ciertos flujos secundarios.`,
        priority: 55
      });
    }
  }

  if (fallbackSteps && fallbackSteps > 0) {
    findings.push({
      label: "Navegacion indirecta detectada",
      severity: fallbackSteps > 2 ? "medium" : "low",
      detail: `En ${fallbackSteps} paso(s) el elemento clickeado no tenia transicion directa y se uso un nodo cercano como alternativa. Esto sugiere que el flujo esperado y el prototipo no estan completamente alineados.`,
      priority: 48
    });
  }

  if (retriedSteps && retriedSteps > 0) {
    const successRate = retriedSuccessfully > 0 ? Math.round((retriedSuccessfully / retriedSteps) * 100) : 0;

    if (retriedSuccessfully === retriedSteps) {
      findings.push({
        label: "Recuperacion exitosa mediante alternativas",
        severity: retriedSteps > 2 ? "medium" : "low",
        detail: `En ${retriedSteps} paso(s) el elemento inicial no tenia transicion, pero se recupero usando alternativas (${totalRetryAttempts} intento(s) total). El flujo permitio cambios de estrategia sin bloqueos.`,
        priority: 35
      });
    } else if (retriedSuccessfully > 0) {
      findings.push({
        label: "Recuperacion parcial mediante reintentos",
        severity: "low",
        detail: `En ${retriedSteps} paso(s) fue necesario reintentar: ${retriedSuccessfully} exitosos, ${retriedSteps - retriedSuccessfully} fallidos. La estrategia de reintento tuvo ${successRate}% de exito.`,
        priority: 42
      });
    } else {
      findings.push({
        label: "Reintentos fallidos - bloqueo en navegacion",
        severity: "high",
        detail: `En ${retriedSteps} paso(s) incluso los reintentos con elementos alternativos no encontraron transiciones validas. El usuario quedo "atrapado" sin poder avanzar.`,
        priority: 68
      });
    }
  }

  if (stepLog.length > 2) {
    const screens = stepLog.map((s) => s.screen).filter((v): v is string => Boolean(v));
    const screenCounts = screens.reduce<Record<string, number>>((acc, s) => {
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    const stagnantScreens = Object.entries(screenCounts).filter(([, count]) => count >= 3);

    if (stagnantScreens.length > 0) {
      const examples = stagnantScreens.map(([name, count]) => `"${name}" (${count}x)`).join(", ");
      findings.push({
        label: "Estancamiento en pantallas del prototipo",
        severity: "high",
        detail: `El usuario permanecio o regreso a las mismas pantallas multiples veces sin avanzar: ${examples}. El flujo no da senales claras de progreso.`,
        priority: 72
      });
    }
  }

  if (stepLog.length >= 3) {
    const certainties = stepLog.map((s) => s.certainty).filter((n): n is number => typeof n === "number");
    if (certainties.length >= 3) {
      const first = certainties.slice(0, Math.ceil(certainties.length / 2));
      const last = certainties.slice(Math.floor(certainties.length / 2));
      const avgFirst = first.reduce((a, b) => a + b, 0) / first.length;
      const avgLast = last.reduce((a, b) => a + b, 0) / last.length;
      const decay = avgFirst - avgLast;

      if (decay >= 15) {
        findings.push({
          label: "Decaimiento de certeza a lo largo del flujo",
          severity: decay >= 25 ? "high" : "medium",
          detail: `La confianza del agente al elegir acciones bajo de ~${Math.round(avgFirst)}% al inicio a ~${Math.round(avgLast)}% al final. El prototipo pierde claridad de accion a medida que el flujo avanza.`,
          priority: 62
        });
      }
    }
  }

  const efficiencyFinding = evaluateStepEfficiency(stepLog, screenTransitions, status);
  if (efficiencyFinding) findings.push(efficiencyFinding);

  if (stepLog.length > 0) {
    const deadEnds = stepLog.filter((s) => s.connectedCount === 0 && (s.candidateCount || 0) > 0);
    if (deadEnds.length > 0) {
      const screens = [...new Set(deadEnds.map((s) => s.screen).filter((v): v is string => Boolean(v)))];
      findings.push({
        label: "Pantallas sin transiciones definidas",
        severity: deadEnds.length > 1 ? "high" : "medium",
        detail: `${deadEnds.length} paso(s) ocurrieron en pantallas donde ningun elemento interactivo tenia transicion: ${screens.slice(0, 3).map((s) => `"${s}"`).join(", ")}. Estas pantallas son callejones sin salida para el usuario.`,
        priority: 70
      });
    }
  }

  const withPriority = findings.filter((f) => f.priority !== undefined);
  const withoutPriority = findings.filter((f) => f.priority === undefined);
  withPriority.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  return [...withPriority, ...withoutPriority].slice(0, 6);
}

export function buildFollowUps(task: RepTask, status: string): string[] {
  if (task.type === "idea") {
    return [
      "Quieres que te cuente que parte me resulto mas valiosa?",
      "Te interesa mas entender que me genera confianza o que me haria dudar?"
    ];
  }
  return status === "abandoned" || status === "error"
    ? [
        "Quieres que te explique el punto exacto donde dejaria el flujo?",
        "Te interesa que detalle por que no senti suficiente certeza para seguir?"
      ]
    : [
        "Quieres que te cuente que parte del flujo me parecio mas clara?",
        "Te interesa revisar donde senti mas esfuerzo aunque pude completar la tarea?"
      ];
}

export function buildPredictedPoints(rng: () => number) {
  return Array.from({ length: 8 }, (_, index) => ({
    x: 70 + Math.round(rng() * 220),
    y: 110 + Math.round(rng() * 360),
    step: index + 1,
    screen: "Predictive",
    certainty: 60 + Math.round(rng() * 30),
    weight: 0.2 + rng() * 0.6
  }));
}

export function buildPredictiveNotes(task: RepTask, persona: RepPersona): string[] {
  return [
    `Prediccion de atencion inicial ajustada al contexto de ${persona.segment || "uso"} y al task ${task.type}.`,
    "Las zonas de mayor saliencia se muestran como una capa estimada y no como comportamiento observado.",
    "Util para comparar expectativas visuales con los clicks reales del run."
  ];
}

export function buildNavigationScreens(task: RepTask, rng: () => number, hostLabel: string): string[] {
  const hasBooking = /booking|reserva|vacacion|hotel/i.test(task.prompt || "");
  const hasCheckout = /checkout|pago|comprar|book/i.test(task.success_criteria || "");
  const host = hostLabel || "figma prototype";
  const screens = [`${host} cover`, "Browse options", hasBooking ? "Property details" : "Task details", "Decision point"];
  if (hasCheckout || rng() > 0.6) {
    screens.push("Checkout");
  }
  screens.push("Confirmation");
  return screens;
}
