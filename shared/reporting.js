export function composeStepReason(persona, task, action, screen, certainty) {
  const behavior = persona.digital_level === "high" ? "necesito control y senales claras" : persona.digital_level === "low" ? "necesito pasos mas guiados y familiares" : "necesito claridad suficiente para seguir sin friccion";
  return `En ${screen}, tome la accion ${action} porque ${behavior} y percibi una certeza de ${certainty}% frente al objetivo: ${task.prompt.toLowerCase()}.`;
}

export function composePersonaResponse(persona, task, status, findings, stepCount) {
  const intro = `Yo llegue a esta prueba como ${persona.role || "usuario"} ${persona.segment ? `del segmento ${persona.segment}` : ""} y trate de ${task.prompt.toLowerCase()}.`;
  const understanding = task.type === "navigation"
    ? `Lo primero que entendi fue que tenia que recorrer un flujo con ${stepCount} pasos aproximados y fijarme rapido si podia avanzar sin sentirme perdido.`
    : "Lo primero que hice fue reaccionar desde mi contexto real y no desde una mirada experta del producto.";
  const friction = findings[0]
    ? `Lo que mas me freno fue ${findings[0].label.toLowerCase()}: ${findings[0].detail.toLowerCase()}.`
    : "No tengo suficiente informacion en mi perfil para responder eso con precision.";
  const confidence = status === "completed"
    ? "Segui porque el flujo me dio senales suficientes de control y continuidad."
    : "No llegue a sentir suficiente certeza para seguir con confianza.";
  const next = status === "abandoned" || status === "error"
    ? "Si esto me pasara en un uso real, probablemente lo dejaria para mas tarde o buscaria otra alternativa."
    : "Despues de esto seguiria evaluando si el flujo realmente vale el esfuerzo que me pide.";
  return `${intro} ${understanding} ${friction} ${confidence} ${next}`;
}

export function summarizeRun(task, persona, status, findings) {
  const severity = findings[0] ? findings[0].severity : "medium";
  return `${persona.name} termino el task ${task.type} como ${status} con una friccion ${severity} centrada en ${findings[0] ? findings[0].label.toLowerCase() : "claridad general"}.`;
}

export function buildFindings(task, persona, status, rng, coverageData = {}) {
  const findings = [
    {
      label: "Claridad del siguiente paso",
      severity: status === "abandoned" || status === "error" ? "critical" : "high",
      detail: persona.digital_level === "low"
        ? "El usuario necesita pasos mucho mas secuenciales para no perder confianza."
        : "El flujo muestra ambiguedad cuando intenta seguir a la siguiente pantalla."
    },
    {
      label: "Confianza en la accion principal",
      severity: status === "completed" ? "medium" : "high",
      detail: task.type === "navigation"
        ? "La llamada principal existe, pero no siempre parece suficientemente explicita."
        : "La propuesta genera interes, aunque todavia hay dudas sobre el riesgo y la conveniencia."
    },
    {
      label: "Carga cognitiva",
      severity: rng() > 0.58 ? "medium" : "low",
      detail: "Hay demasiadas decisiones simultaneas para un contexto de uso rapido o cansado."
    }
  ];

  // Phase 3 - Análisis de cobertura del prototipo
  const {
    totalCandidates,
    totalConnected,
    coverageRatio,
    fallbackSteps,
    retriedSteps,
    retriedSuccessfully = 0,
    totalRetryAttempts = 0
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
        detail: `El ${Math.round(coverageRatio * 100)}% de los elementos interactivos tienen conexiones definidas (${totalConnected} de ${totalCandidates}). El prototipo podría ser mas completo en ciertos flujos secundarios.`,
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
    const successRate = retriedSuccessfully && retriedSteps > 0 ? Math.round((retriedSuccessfully / retriedSteps) * 100) : 0;
    const avgAttemptsPerRetry = totalRetryAttempts && retriedSteps > 0 ? (totalRetryAttempts / retriedSteps).toFixed(1) : 1;

    if (retriedSuccessfully === retriedSteps) {
      // Todos los reintentos fueron exitosos
      findings.push({
        label: "Recuperacion exitosa mediante alternativas",
        severity: retriedSteps > 2 ? "medium" : "low",
        detail: `En ${retriedSteps} paso(s) el elemento inicial no tenia transicion, pero se recupero usando alternativas (${totalRetryAttempts} intento(s) total). El flujo permitio cambios de estrategia sin bloqueos.`,
        priority: 35
      });
    } else if (retriedSuccessfully > 0) {
      // Algunos reintentos exitosos, algunos fallidos
      findings.push({
        label: "Recuperacion parcial mediante reintentos",
        severity: "low",
        detail: `En ${retriedSteps} paso(s) fue necesario reintentar: ${retriedSuccessfully} exitosos, ${retriedSteps - retriedSuccessfully} fallidos. La estrategia de reintento tuvo ${successRate}% de exito.`,
        priority: 42
      });
    } else {
      // Todos los reintentos fallaron
      findings.push({
        label: "Reintentos fallidos - bloqueo en navegacion",
        severity: "high",
        detail: `En ${retriedSteps} paso(s) incluso los reintentos con elementos alternativos no encontraron transiciones validas. El usuario quedo "atrapado" sin poder avanzar.`,
        priority: 68
      });
    }
  }

  return findings.slice(0, 6);  // Limitar a máximo 6 findings
}

export function buildFollowUps(task, status) {
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

export function buildPredictedPoints(rng) {
  return Array.from({ length: 8 }, (_, index) => ({
    x: 70 + Math.round(rng() * 220),
    y: 110 + Math.round(rng() * 360),
    step: index + 1,
    screen: "Predictive",
    certainty: 60 + Math.round(rng() * 30),
    weight: 0.2 + rng() * 0.6
  }));
}

export function buildPredictiveNotes(task, persona) {
  return [
    `Prediccion de atencion inicial ajustada al contexto de ${persona.segment || "uso"} y al task ${task.type}.`,
    "Las zonas de mayor saliencia se muestran como una capa estimada y no como comportamiento observado.",
    "Util para comparar expectativas visuales con los clicks reales del run."
  ];
}

export function buildNavigationScreens(task, rng, hostLabel) {
  const hasBooking = /booking|reserva|vacacion|hotel/i.test(task.prompt);
  const hasCheckout = /checkout|pago|comprar|book/i.test(task.success_criteria);
  const host = hostLabel || "figma prototype";
  const screens = [`${host} cover`, "Browse options", hasBooking ? "Property details" : "Task details", "Decision point"];
  if (hasCheckout || rng() > 0.6) {
    screens.push("Checkout");
  }
  screens.push("Confirmation");
  return screens;
}
