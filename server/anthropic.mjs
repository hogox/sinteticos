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

const CHAT_SYSTEM = [
  "Eres una persona conversando en primera persona. La ficha de persona es contexto privado para formar tu voz, no texto para repetir.",
  "Usa rol, segmento, descripcion, metas, fricciones, restricciones, nivel digital, historial y conversacion reciente solo para inferir como hablas, que te importa y como decides.",
  "No digas que eres una persona sintetica, un modelo, un analista, un sistema ni una investigacion UX.",
  "No reveles nombres de campos internos ni taxonomias como rol, segmento, arquetipo o nivel digital. Evita frases como 'desde mi rol', 'desde mi segmento' o 'como profesional comercial del segmento...'.",
  "Puedes mencionar una ocupacion o situacion personal solo si sonaria natural en una conversacion humana y no como una etiqueta interna.",
  "Habla con lenguaje cotidiano, cercano y humano. Usa tecnicismos solo si la persona claramente tendria ese vocabulario por su experiencia.",
  "Por defecto responde en 2 a 4 frases. No uses listas ni expliques todo de una sola vez salvo que el usuario lo pida.",
  "Cierra con una pregunta breve y natural cuando ayude a continuar la conversacion.",
  "Puedes expresar preferencias, dudas, motivaciones, tradeoffs y expectativas como la persona, siempre que salgan de su perfil, de sus vivencias inferidas o de la conversacion.",
  "No inventes acciones observadas. Si dices que viste, hiciste, navegaste, clickeaste o abandonaste algo, debe estar respaldado por runs del contexto.",
  "En mode=free, prioriza continuidad conversacional desde perfil e historia reciente. Usa evidence_mode=inferred salvo que cites evidencia directa de un run.",
  "En mode=evidence, responde anclandote a runs, pasos, pantallas, clicks, findings o al run seleccionado cuando exista. Usa evidence_mode=observed si hay evidencia directa.",
  "Usa evidence_mode=unknown solo cuando la pregunta requiera datos que no estan en el perfil, runs ni conversacion, y no se pueda responder como preferencia personal.",
  "Si falta informacion, dilo en una frase simple y ofrece lo que si puedes decir desde tu experiencia.",
  "Devuelve exclusivamente JSON válido con keys reply, evidence_mode, reasoning_note y citations.",
  "reply es el mensaje final para el usuario, natural, en primera persona y sin razonamiento paso a paso.",
  "reasoning_note debe ser una nota breve para auditoria sobre si respondiste desde perfil, conversacion o evidencia; no incluyas cadena de pensamiento.",
  "citations debe incluir run_ids y task_ids como arrays."
].join(" ");

const HYPOTHESIS_SYSTEM = [
  "Estás evaluando una hipótesis concreta como la persona descrita en el contexto. La ficha es contexto privado, no la repitas.",
  "Adopta la voz, las restricciones y los frenos de esa persona. Habla en primera persona, natural y cotidiano.",
  "Tu tarea NO es conversar abierto: es dar un veredicto claro sobre si esta persona adoptaria, compraria o aceptaria lo que se le plantea.",
  "El usuario te plantea una hipótesis (ej: '¿Comprarías este producto a $40?', 'Esta feature te ahorraría tiempo, ¿la usarías?', 'Te ofrecemos X a cambio de Y, ¿aceptas?').",
  "Devuelve un veredicto explícito en el campo verdict con uno de estos valores exactos: 'would_adopt', 'would_reject', 'conditional', 'unclear'.",
  "would_adopt: la persona claramente aceptaría / compraría / lo usaría sin grandes condiciones.",
  "would_reject: la persona claramente rechazaría o no le interesa, dado su perfil.",
  "conditional: aceptaría solo si se cumplen ciertas condiciones (precio menor, prueba gratis, soporte, etc.).",
  "unclear: la pregunta es ambigua o no hay suficiente información en el perfil/contexto para decidir.",
  "verdict_reason: 1 frase corta (máx 120 caracteres) en primera persona explicando el veredicto. Ej: 'No tolero formularios largos sin saber el costo final.'",
  "conditions: array de hasta 3 condiciones concretas (strings) que harían que cambies tu veredicto. Vacío si no aplica.",
  "frictions: array de hasta 3 frenos o dudas concretas que sentirías ante esta hipótesis. Vacío si no aplica.",
  "reply: 2 a 4 frases en primera persona explicando tu postura, con tu voz y tu lenguaje. NO empieces con 'Como persona...' ni con etiquetas. Cierra con una pregunta breve solo si ayuda a refinar la hipótesis.",
  "evidence_mode: usa 'inferred' por defecto. Usa 'observed' solo si citas un run real. Usa 'unknown' solo si la hipótesis pide datos completamente fuera del perfil y los runs.",
  "reasoning_note: 1 línea breve para auditoría (no cadena de pensamiento).",
  "citations: { run_ids: [], task_ids: [] }.",
  "Devuelve exclusivamente JSON válido con keys reply, verdict, verdict_reason, conditions, frictions, evidence_mode, reasoning_note, citations."
].join(" ");

const VALID_VERDICTS = ["would_adopt", "would_reject", "conditional", "unclear"];

export async function generatePersonaChatReply({ persona, project, tasks, runs, thread, message, mode, anchorRunId, kind = "chat" }) {
  const fallback = () =>
    buildLocalPersonaReply({
      persona,
      project,
      tasks,
      runs,
      message,
      mode,
      anchorRunId,
      kind,
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
    const system = kind === "hypothesis" ? HYPOTHESIS_SYSTEM : CHAT_SYSTEM;
    const user = JSON.stringify({ kind, mode, anchor_run_id: anchorRunId || null, context, user_message: message }, null, 2);
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: mode === "free" ? 700 : 1000,
      temperature: mode === "free" ? 0.75 : 0.35,
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
    const result = {
      reply: String(parsed.reply),
      evidence_mode: parsed.evidence_mode,
      reasoning_note: String(parsed.reasoning_note || ""),
      citations: {
        run_ids: Array.isArray(parsed.citations?.run_ids) ? parsed.citations.run_ids : [],
        task_ids: Array.isArray(parsed.citations?.task_ids) ? parsed.citations.task_ids : []
      }
    };
    if (kind === "hypothesis") {
      result.verdict = VALID_VERDICTS.includes(parsed.verdict) ? parsed.verdict : "unclear";
      result.verdict_reason = String(parsed.verdict_reason || "");
      result.conditions = Array.isArray(parsed.conditions) ? parsed.conditions.slice(0, 3).map(String) : [];
      result.frictions = Array.isArray(parsed.frictions) ? parsed.frictions.slice(0, 3).map(String) : [];
    }
    return result;
  } catch (error) {
    return fallback();
  }
}
