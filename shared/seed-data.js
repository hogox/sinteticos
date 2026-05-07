export function buildInitialState(uid, simulateRunFn) {
    const now = new Date().toISOString();
    const project = {
        id: uid("project"),
        name: "Demo workspace",
        description: "Proyecto demo para explorar arquetipos, tareas y corridas del laboratorio.",
        created_at: now,
        updated_at: now
    };
    const personaA = {
        id: uid("persona"),
        name: "Catalina, viajera practica",
        description: "Busca resolver rapido y no tolera pasos ambiguos cuando esta en movimiento.",
        role: "Profesional comercial",
        segment: "Planificadora de escapadas cortas",
        functional_context: "Organiza viajes personales entre reuniones y trayectos.",
        usage_context: "Movil, ratos cortos, multitarea.",
        goals: "Encontrar una opcion confiable y cerrar rapido.",
        motivations: "Ahorrar tiempo y evitar errores en reserva.",
        needs: "Claridad en costos, confianza y continuidad entre pantallas.",
        behaviors: "Compara un poco, luego decide por conveniencia.",
        pains: "Formularios largos, mensajes ambiguos y sorpresas al final.",
        frictions: "Carga cognitiva alta y dudas en el siguiente paso.",
        personality_traits: "Directa, apurada, cautelosa con pagos.",
        digital_environment: "Usa apps de viajes y productividad todo el dia.",
        digital_behavior: "Mobile-first, explora poco y abandona rapido si algo no cierra.",
        devices: "iPhone y notebook de trabajo",
        digital_level: "medium",
        apps_used: "Booking, Airbnb, Google Maps, Notion",
        restrictions: "Poco tiempo, mala conectividad ocasional.",
        attachments: "",
        status: "active",
        version: 1,
        created_at: now,
        updated_at: now
    };
    const personaB = {
        id: uid("persona"),
        name: "Matias, comprador tecnico",
        description: "Detecta ineficiencias rapido y espera control sobre lo que hace.",
        role: "Ingeniero de software",
        segment: "Adoptador digital exigente",
        functional_context: "Evalua herramientas nuevas para uso personal y laboral.",
        usage_context: "Desktop-first, sesiones mas largas.",
        goals: "Completar tareas con velocidad y transparencia.",
        motivations: "Reducir pasos innecesarios y entender el sistema.",
        needs: "Senales claras de estado, consistencia y baja friccion.",
        behaviors: "Explora por su cuenta, compara y cuestiona decisiones de interfaz.",
        pains: "Flows ineficientes, labels vagos, info oculta.",
        frictions: "Errores evitables y falta de feedback.",
        personality_traits: "Analitico, rapido, poco tolerante a fallas repetidas.",
        digital_environment: "Usa productos digitales de forma intensiva.",
        digital_behavior: "Desktop-first, baja tolerancia a fricciones evitables.",
        devices: "MacBook Pro y Android",
        digital_level: "high",
        apps_used: "Figma, Linear, Slack, Chrome, Gmail",
        restrictions: "No acepta pasos sin razon clara.",
        attachments: "",
        status: "active",
        version: 1,
        created_at: now,
        updated_at: now
    };
    const taskA = {
        id: uid("task"),
        project_id: project.id,
        persona_id: personaA.id,
        type: "navigation",
        prompt: "Estas buscando tu proximo lugar de vacaciones y quieres hacer un booking en el sitio.",
        url: "https://www.figma.com/proto/demo-vacation-flow",
        success_criteria: "Encontrar una propiedad y llegar al paso de booking con confianza.",
        max_steps: 6,
        mcp_enabled: true,
        predictive_attention_enabled: true,
        artifacts_enabled: true,
        status: "ready",
        created_at: now,
        updated_at: now
    };
    const taskB = {
        id: uid("task"),
        project_id: project.id,
        persona_id: personaB.id,
        type: "idea",
        prompt: "Validar una nueva feature que resume automaticamente comparativas de planes.",
        url: "",
        success_criteria: "Entender que tan util, creible y adoptable suena para el arquetipo.",
        max_steps: 4,
        mcp_enabled: false,
        predictive_attention_enabled: false,
        artifacts_enabled: true,
        status: "ready",
        created_at: now,
        updated_at: now
    };
    const runs = simulateRunFn
        ? [simulateRunFn(taskA, personaA, 1), simulateRunFn(taskA, personaA, 2), simulateRunFn(taskB, personaB, 1)]
        : [];
    const calibrations = simulateRunFn
        ? [
            {
                id: uid("calibration"),
                project_id: project.id,
                persona_id: personaA.id,
                task_id: taskA.id,
                prototype_version: "vacation-flow-v1",
                human_result: "El benchmark humano encontro dudas en costos y miedo a errores antes de reservar.",
                synthetic_result: "El arquetipo abandono o dudo en el paso de decision cuando no se sintio control suficiente.",
                critical_findings: "Claridad del siguiente paso; confianza en accion principal",
                agreement: 72,
                notes: "Proxy calibrado para priorizar test humano posterior.",
                created_at: now
            }
        ]
        : [];
    return { projects: [project], personas: [personaA, personaB], tasks: [taskA, taskB], runs, calibrations };
}
