import Anthropic from "@anthropic-ai/sdk";
import { buildLocalPersonaReply, buildPersonaChatContext } from "../shared/persona-chat.js";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 8192;

const PERSONA_FIELD_DESCRIPTIONS = {
  name: "Nombre completo y plausible (no genérico).",
  description: "Resumen de 1-2 frases del arquetipo.",
  role: "Rol u ocupación principal.",
  segment: "Segmento de mercado o demográfico al que pertenece.",
  functional_context: "Contexto funcional: qué hace, dónde, con qué fin.",
  usage_context: "Cuándo y cómo usa productos/servicios digitales relacionados.",
  goals: "Metas concretas que persigue.",
  motivations: "Motivaciones profundas detrás de las metas.",
  needs: "Necesidades específicas que el producto debería cubrir.",
  behaviors: "Comportamientos observables habituales.",
  pains: "Dolores o frustraciones recurrentes.",
  frictions: "Frenos o barreras al usar productos digitales.",
  personality_traits: "3-5 rasgos de personalidad separados por coma.",
  digital_environment: "Entorno digital: conectividad, dispositivos disponibles, contexto físico.",
  digital_behavior: "Patrones de uso digital: frecuencia, horarios, hábitos.",
  devices: "Dispositivos principales (e.g. 'iPhone 12, laptop Windows').",
  digital_level: "Uno de: 'low', 'medium', 'high'.",
  apps_used: "Apps que usa habitualmente.",
  restrictions: "Restricciones (técnicas, de tiempo, físicas, regulatorias).",
  attachments: "URLs de referencia o notas adicionales. Puede quedar vacío."
};

const PERSONA_PROPERTIES = Object.fromEntries(
  Object.entries(PERSONA_FIELD_DESCRIPTIONS).map(([key, description]) => {
    if (key === "digital_level") {
      return [key, { type: "string", enum: ["low", "medium", "high"], description }];
    }
    return [key, { type: "string", description }];
  })
);

const TOOL = {
  name: "emit_personas",
  description: "Devuelve la lista de personas sintéticas generadas o extraídas, lista para guardar.",
  input_schema: {
    type: "object",
    properties: {
      personas: {
        type: "array",
        description: "Personas sintéticas. La cantidad debe coincidir con la solicitada.",
        items: {
          type: "object",
          properties: PERSONA_PROPERTIES,
          required: Object.keys(PERSONA_PROPERTIES).filter((k) => k !== "attachments")
        }
      }
    },
    required: ["personas"]
  }
};

let client = null;
function getClient() {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const error = new Error("ANTHROPIC_API_KEY no está definida en el entorno.");
    error.code = "ANTHROPIC_KEY_MISSING";
    throw error;
  }
  client = new Anthropic({ apiKey });
  return client;
}

async function callTool(systemPrompt, userPrompt) {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content: userPrompt }]
  });
  const toolUse = response.content.find((block) => block.type === "tool_use" && block.name === TOOL.name);
  if (!toolUse || !toolUse.input || !Array.isArray(toolUse.input.personas)) {
    const error = new Error("La respuesta del modelo no incluyó personas válidas.");
    error.code = "ANTHROPIC_BAD_RESPONSE";
    throw error;
  }
  return toolUse.input.personas;
}

export async function generatePersonas(description, quantity) {
  const n = Math.max(1, Math.min(10, Number(quantity) || 1));
  const trimmed = String(description || "").trim();
  if (!trimmed) {
    const error = new Error("La descripción está vacía.");
    error.code = "INVALID_INPUT";
    throw error;
  }
  const system = [
    "Eres un investigador UX que diseña usuarios sintéticos detallados a partir de descripciones breves.",
    "Tu trabajo es expandir la descripción del usuario en personas con todos los campos del esquema.",
    "Cada persona debe ser internamente coherente, plausible y diferenciada de las demás cuando se piden varias.",
    "Si se piden N>1 personas, varía rasgos, edades, contextos y comportamientos manteniendo el segmento solicitado.",
    "Responde en español neutro. Llama a la herramienta emit_personas exactamente una vez."
  ].join(" ");
  const user = `Genera ${n} persona(s) sintética(s) coherente(s) con esta descripción:\n\n"""${trimmed}"""\n\nDevuelve exactamente ${n} elemento(s) en el array personas.`;
  return callTool(system, user);
}

export async function extractPersonas(sourceText, quantity) {
  const n = Math.max(1, Math.min(20, Number(quantity) || 1));
  const trimmed = String(sourceText || "").trim();
  if (!trimmed) {
    const error = new Error("El texto fuente está vacío.");
    error.code = "INVALID_INPUT";
    throw error;
  }
  const system = [
    "Eres un investigador UX que extrae usuarios sintéticos a partir de evidencia documental.",
    "Solo puedes inferir personas respaldadas por el texto fuente (transcripciones, notas, datos).",
    "No inventes datos no respaldados; cuando un campo no esté en la evidencia, infiere de forma conservadora basándote en el contexto disponible y márcalo en attachments.",
    "Cada persona debe corresponder a una voz/perfil distinguible en los datos.",
    "Responde en español neutro. Llama a la herramienta emit_personas exactamente una vez."
  ].join(" ");
  const user = `Extrae hasta ${n} persona(s) sintética(s) distinta(s) del siguiente texto fuente. Si la evidencia no alcanza para ${n}, devuelve menos. En attachments incluye una breve nota con la evidencia clave que respalda a esa persona.\n\nTEXTO FUENTE:\n"""\n${trimmed}\n"""`;
  return callTool(system, user);
}

export function isAnthropicConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function parseJsonReply(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  return JSON.parse(candidate);
}

export async function generatePersonaChatReply({ persona, project, tasks, runs, thread, message, mode, anchorRunId }) {
  const fallback = () =>
    buildLocalPersonaReply({
      persona,
      project,
      tasks,
      runs,
      message,
      mode,
      anchorRunId,
      history: thread?.messages || []
    });

  if (!isAnthropicConfigured()) {
    return fallback();
  }

  try {
    const anthropic = getClient();
    const context = buildPersonaChatContext({
      persona,
      project,
      tasks,
      runs,
      anchorRunId,
      history: thread?.messages || []
    });
    const system = [
      "Eres una persona sintética dentro de un laboratorio de investigación UX.",
      "Responde siempre en primera persona y desde el rol, segmento, restricciones, nivel digital y contexto de la persona.",
      "No respondas como analista, diseñador, PM, sistema ni consultor.",
      "No inventes acciones observadas. Si dices que viste, hiciste, navegaste, clickeaste o abandonaste algo, debe estar respaldado por runs del contexto.",
      "Clasifica cada respuesta como observed, inferred o unknown.",
      "observed: usas evidencia directa de runs, pasos, pantallas, clicks o findings.",
      "inferred: interpretas desde el perfil o desde evidencia indirecta sin afirmar una acción nueva.",
      "unknown: no hay base suficiente en perfil ni runs.",
      "Devuelve exclusivamente JSON válido con keys reply, evidence_mode, reasoning_note y citations.",
      "citations debe incluir run_ids y task_ids como arrays."
    ].join(" ");
    const user = JSON.stringify({ mode, anchor_run_id: anchorRunId || null, context, user_message: message }, null, 2);
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: user }]
    });
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    const parsed = parseJsonReply(text);
    if (!parsed || !parsed.reply || !["observed", "inferred", "unknown"].includes(parsed.evidence_mode)) {
      return fallback();
    }
    return {
      reply: String(parsed.reply),
      evidence_mode: parsed.evidence_mode,
      reasoning_note: String(parsed.reasoning_note || ""),
      citations: {
        run_ids: Array.isArray(parsed.citations?.run_ids) ? parsed.citations.run_ids : [],
        task_ids: Array.isArray(parsed.citations?.task_ids) ? parsed.citations.task_ids : []
      }
    };
  } catch (error) {
    return fallback();
  }
}
