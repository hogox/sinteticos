import { getSkill, loadSkillRegistry } from "./loader.mjs";
import { callProvider, getDefaultProvider, listAvailableProviders } from "./providers.mjs";

function pickRunFields(run) {
  if (!run) return null;
  return {
    id: run.id,
    task_id: run.task_id,
    persona_id: run.persona_id,
    project_id: run.project_id,
    persona_version: run.persona_version,
    seed: run.seed,
    engine: run.engine,
    completion_status: run.completion_status,
    started_at: run.started_at,
    finished_at: run.finished_at,
    report_summary: run.report_summary,
    persona_response: run.persona_response,
    step_log: run.step_log || [],
    click_points: run.click_points || [],
    screen_transitions: run.screen_transitions || [],
    findings: run.report_details?.prioritized_findings || [],
    coverage: run.coverage_data || null
  };
}

function pickPersonaFields(persona) {
  if (!persona) return null;
  return {
    id: persona.id,
    name: persona.name,
    role: persona.role,
    segment: persona.segment,
    description: persona.description,
    digital_level: persona.digital_level,
    digital_environment: persona.digital_environment,
    digital_behavior: persona.digital_behavior,
    devices: persona.devices,
    goals: persona.goals,
    motivations: persona.motivations,
    needs: persona.needs,
    behaviors: persona.behaviors,
    pains: persona.pains,
    frictions: persona.frictions,
    restrictions: persona.restrictions
  };
}

function pickTaskFields(task) {
  if (!task) return null;
  return {
    id: task.id,
    type: task.type,
    prompt: task.prompt,
    success_criteria: task.success_criteria,
    url: task.url,
    capabilities: task.capabilities,
    mcp_enabled: task.mcp_enabled
  };
}

function buildUserPayload(skill, { runs, persona, task, project }) {
  const payload = {
    skill: skill.name,
    task: pickTaskFields(task),
    persona: pickPersonaFields(persona),
    project: project ? { id: project.id, name: project.name, description: project.description } : null
  };
  if (skill.batch) {
    payload.runs = (runs || []).map(pickRunFields).filter(Boolean);
  } else {
    payload.run = pickRunFields(runs?.[0]);
  }
  return payload;
}

function extractJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function validateAgainstSchema(value, schema) {
  if (!schema) return { ok: true };
  const errors = [];
  const check = (val, sch, pathStr) => {
    if (!sch) return;
    const expected = sch.type;
    if (expected === "object") {
      if (val === null || typeof val !== "object" || Array.isArray(val)) {
        errors.push(`${pathStr || "$"}: expected object`);
        return;
      }
      const required = Array.isArray(sch.required) ? sch.required : [];
      for (const key of required) {
        if (!(key in val)) errors.push(`${pathStr || "$"}.${key}: missing required`);
      }
      if (sch.properties) {
        for (const [key, sub] of Object.entries(sch.properties)) {
          if (key in val) check(val[key], sub, `${pathStr}.${key}`);
        }
      }
    } else if (expected === "array") {
      if (!Array.isArray(val)) {
        errors.push(`${pathStr || "$"}: expected array`);
        return;
      }
      if (sch.items) {
        val.forEach((item, idx) => check(item, sch.items, `${pathStr}[${idx}]`));
      }
    } else if (expected === "string") {
      if (typeof val !== "string") errors.push(`${pathStr}: expected string`);
      else if (Array.isArray(sch.enum) && !sch.enum.includes(val)) {
        errors.push(`${pathStr}: not in enum ${sch.enum.join("|")}`);
      }
    } else if (expected === "number" || expected === "integer") {
      if (typeof val !== "number") errors.push(`${pathStr}: expected number`);
    } else if (expected === "boolean") {
      if (typeof val !== "boolean") errors.push(`${pathStr}: expected boolean`);
    }
  };
  check(value, schema, "$");
  return { ok: errors.length === 0, errors };
}

export async function runSkill(name, payload, { provider } = {}) {
  const registry = await loadSkillRegistry();
  const skill = getSkill(registry, name);
  if (!skill) {
    const error = new Error(`Skill no encontrado: ${name}`);
    error.code = "SKILL_NOT_FOUND";
    throw error;
  }

  const chosenProvider = provider || getDefaultProvider();
  if (!chosenProvider) {
    const error = new Error("No hay proveedores LLM configurados (define ANTHROPIC_API_KEY, OPENAI_API_KEY o GOOGLE_API_KEY).");
    error.code = "NO_PROVIDER";
    throw error;
  }
  if (skill.providers.length && !skill.providers.includes(chosenProvider)) {
    const error = new Error(`El skill ${name} no soporta el proveedor ${chosenProvider}.`);
    error.code = "PROVIDER_NOT_SUPPORTED";
    throw error;
  }

  const userPayload = buildUserPayload(skill, payload);
  const userMessage = [
    "Analiza el siguiente contexto y devuelve EXCLUSIVAMENTE JSON válido conforme al schema descrito en tu rol.",
    "No incluyas prosa, comentarios ni bloques de código. Solo el objeto JSON.",
    "",
    "CONTEXTO:",
    JSON.stringify(userPayload, null, 2)
  ].join("\n");

  const model = skill.default_model?.[chosenProvider] || null;
  const result = await callProvider(chosenProvider, {
    system: skill.prompt,
    user: userMessage,
    model
  });

  const parsed = extractJson(result.text);
  if (!parsed) {
    return {
      ok: false,
      error: "json_parse_failed",
      raw: result.text,
      provider: chosenProvider,
      model: result.model,
      latency_ms: result.latency_ms
    };
  }

  const validation = validateAgainstSchema(parsed, skill.schema);
  if (!validation.ok) {
    return {
      ok: false,
      error: "schema_violation",
      details: validation.errors,
      output: parsed,
      raw: result.text,
      provider: chosenProvider,
      model: result.model,
      latency_ms: result.latency_ms
    };
  }

  return {
    ok: true,
    output: parsed,
    provider: chosenProvider,
    model: result.model,
    latency_ms: result.latency_ms
  };
}

export async function getRuntimeStatus() {
  const registry = await loadSkillRegistry();
  return {
    count: registry.size,
    providers_available: listAvailableProviders(),
    default_provider: getDefaultProvider()
  };
}
