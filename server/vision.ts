import https from "node:https";
import {
  ANTHROPIC_API_KEY,
  VISION_MODEL,
  VISION_MAX_TOKENS,
  VISION_API_URL,
  VISION_RETRY_DELAY_MS,
  VISION_SPEND_LIMIT_USD
} from "./config.ts";

// In-memory spend tracker (resets on server restart)
let totalSpendUsd = 0;
let totalCalls = 0;

// Pricing per million tokens (Haiku 4.5 as default)
const PRICING = {
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4.00 },
  "claude-sonnet-4-5-20241022": { input: 3.00, output: 15.00 },
};

function estimateCostUsd(usage) {
  if (!usage) return 0;
  const prices = PRICING[VISION_MODEL] || PRICING["claude-haiku-4-5-20251001"];
  const inputCost = ((usage.input_tokens || 0) / 1_000_000) * prices.input;
  const outputCost = ((usage.output_tokens || 0) / 1_000_000) * prices.output;
  return inputCost + outputCost;
}

export function isVisionAvailable() {
  if (ANTHROPIC_API_KEY.length === 0) return false;
  if (totalSpendUsd >= VISION_SPEND_LIMIT_USD) {
    console.warn(`[vision] Spend limit reached: $${totalSpendUsd.toFixed(4)} / $${VISION_SPEND_LIMIT_USD}`);
    return false;
  }
  return true;
}

export function getVisionSpend() {
  return { totalSpendUsd, totalCalls, limitUsd: VISION_SPEND_LIMIT_USD };
}

function buildSystemPrompt() {
  return [
    "Eres una persona real probando un sitio web o prototipo. Hablás en español rioplatense, en primera persona, como si estuvieras pensando en voz alta (think-aloud).",
    "No sos un asistente racional: sos una persona con dudas, mood del día, fricciones internas, y a veces clickeás cosas porque te llamaron la atención y listo.",
    "",
    "Acciones disponibles:",
    "- 'click': hacer click en un elemento. Requiere x, y (pixeles desde el top-left).",
    "- 'scroll': bajar para ver más contenido.",
    "- 'back': volver atrás cuando entraste a una sección equivocada.",
    "- 'linger': te quedaste mirando esta pantalla intentando entenderla, sin clickear todavía. Usalo cuando hay confusión real o sobrecarga visual.",
    "- 'complete': la tarea ya está cumplida (estado de éxito visible).",
    "- 'abandon': no hay forma de avanzar (irrelevante, frustración acumulada, no encaja con tu nivel digital).",
    "",
    "Devolvé SOLO un JSON válido (sin markdown, sin fences) con:",
    "- action",
    "- x, y (solo si action='click')",
    "- screenDescription (max 70 chars)",
    "- reason (max 220 chars): pensamiento en primera persona. PERMITIDO Y ESPERADO:",
    "    · dudar: 'No sé si esto... a ver, dejame mirar otra vez'",
    "    · reconocer error: 'Uy, eso no era. Vuelvo'",
    "    · no racionalizar todo: 'Le voy a dar a este, me llamó'",
    "    · expresar mood: 'Estoy apurada, no tengo tiempo de leer todo'",
    "    · variá los inicios — no empieces igual paso a paso",
    "- certainty (0-100): qué tan segura estás. Bajalo cuando dudás, no lo infles para parecer firme.",
    "- relevance (0-100): qué tan relacionado está el contenido con tu tarea.",
    "- emotion ('neutral'|'frustrated'|'confused'|'rushed'|'curious'|'delighted'|'skeptical'): cómo te sentís en este paso. Cambia de paso a paso si la experiencia te cambia el mood.",
    "",
    "Reglas humanas:",
    "- Si tu nivel digital es 'low' y la certainty cayó debajo de 40% por dos pasos seguidos → action='abandon'. No sos perseverante con tecnología confusa.",
    "- Si tu nivel digital es 'medium' y la certainty cayó debajo de 30% por dos pasos seguidos → considerá abandonar.",
    "- Si tu nivel digital es 'high', aguantás certainties bajas siempre que el dominio te interese; abandonás solo cuando es genuinamente irresoluble.",
    "- NO clickees elementos irrelevantes solo porque son llamativos: mejor scroll, linger o back.",
    "- Si la pantalla parece exitosa (confirmación, 'gracias', resumen final) → action='complete'.",
    "- Si ya hiciste scroll y no apareció nada relevante → 'back' o 'abandon' según tu mood."
  ].join("\n");
}

const MOODS = [
  "apurada, querés terminar rápido entre dos cosas",
  "distraída, mientras tomás un café y mirás el celu",
  "escéptica, ya te decepcionaron antes con productos similares",
  "cansada después del trabajo, no querés pensar mucho",
  "curiosa pero con poco tiempo",
  "ansiosa, necesitás resolver esto hoy",
  "tranquila, podés tomarte el tiempo",
  "fastidiada porque ya intentaste antes y no funcionó"
];

function pickMood(seedString) {
  let h = 0;
  const s = String(seedString || "");
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return MOODS[h % MOODS.length];
}

function buildProjectContextBlock(project) {
  if (!project || !project.context) return "";
  const ctx = project.context;
  const lines = [];
  if (ctx.domain_brief) lines.push(`Dominio: ${ctx.domain_brief}`);
  if (ctx.audience_constraints) lines.push(`Audiencia objetivo: ${ctx.audience_constraints}`);
  if (Array.isArray(ctx.prior_findings) && ctx.prior_findings.length) {
    lines.push(`Hallazgos previos del equipo:\n- ${ctx.prior_findings.join("\n- ")}`);
  }
  if (Array.isArray(ctx.do_not) && ctx.do_not.length) {
    lines.push(`Cosas a NO asumir / NO hacer:\n- ${ctx.do_not.join("\n- ")}`);
  }
  return lines.length ? `# Contexto del proyecto\n${lines.join("\n")}\n` : "";
}

function buildPersonaBlock(persona) {
  const lines = [
    `Sos ${persona.name || "el usuario"}, ${persona.role || "usuario"}${persona.segment ? ` (${persona.segment})` : ""}.`
  ];
  if (persona.functional_context) lines.push(`Contexto funcional: ${persona.functional_context}`);
  if (persona.usage_context) lines.push(`Cómo usás productos digitales: ${persona.usage_context}`);
  if (persona.motivations) lines.push(`Te mueve: ${persona.motivations}`);
  if (persona.needs) lines.push(`Necesitás: ${persona.needs}`);
  if (persona.frictions) lines.push(`Te frustra: ${persona.frictions}`);
  if (persona.pains) lines.push(`Te duele en este tipo de productos: ${persona.pains}`);
  if (persona.personality_traits) lines.push(`Sos ${persona.personality_traits}`);
  if (persona.behaviors) lines.push(`Tu comportamiento típico: ${persona.behaviors}`);
  if (persona.digital_level) lines.push(`Nivel digital: ${persona.digital_level}`);
  if (persona.restrictions) lines.push(`Limitaciones reales: ${persona.restrictions}`);
  return lines.join("\n");
}

function buildUserPrompt(task, persona, step, maxSteps, previousActions, runSeed, project) {
  const mood = pickMood(`${runSeed || ""}|${persona.id || persona.name}`);
  const projectBlock = buildProjectContextBlock(project);
  const lines = [];
  if (projectBlock) lines.push(projectBlock);
  lines.push(
    `# Tu perfil`,
    buildPersonaBlock(persona),
    "",
    `# Tu estado hoy`,
    `Estás ${mood}. Esto influye en tu paciencia y en cómo expresás dudas.`,
    "",
    `# Tu tarea`,
    `Querés: ${task.prompt}`,
    `Sabrás que lo lograste cuando: ${task.success_criteria || "completes el flujo principal sin sentirte perdida"}.`,
    "",
    maxSteps == null
      ? `Estás en el paso ${step}. No hay máximo: seguí hasta completar la tarea o abandonar si no encajás con la experiencia. Tomate los pasos que necesites pero sin vueltas innecesarias.`
      : `Estás en el paso ${step} de ${maxSteps}.`
  );
  if (previousActions.length > 0) {
    lines.push("", "# Lo que pasó hasta ahora");
    for (const action of previousActions) {
      lines.push(`- ${action}`);
    }
  }
  lines.push("", "Mirá la pantalla y respondé en JSON. Pensá como vos misma, no como un asistente racional.");
  return lines.join("\n");
}

function parseVisionResponse(raw) {
  let text = raw.trim();
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }
  try {
    const obj = JSON.parse(text);
    const action = ["click", "scroll", "back", "linger", "complete", "abandon"].includes(obj.action) ? obj.action : "click";
    const emotion = ["neutral", "frustrated", "confused", "rushed", "curious", "delighted", "skeptical"].includes(obj.emotion) ? obj.emotion : "neutral";
    const result = {
      action,
      screenDescription: String(obj.screenDescription || "").slice(0, 70),
      reason: String(obj.reason || "").slice(0, 220),
      certainty: Math.max(0, Math.min(100, Number(obj.certainty) || 50)),
      relevance: Math.max(0, Math.min(100, Number(obj.relevance) || 50)),
      emotion,
      taskComplete: action === "complete" || Boolean(obj.taskComplete)
    } as any;
    if (action === "click") {
      if (typeof obj.x !== "number" || typeof obj.y !== "number") return null;
      result.x = Math.round(obj.x);
      result.y = Math.round(obj.y);
    }
    return result;
  } catch (error: any) {
    console.error("[vision] JSON parse failed:", error.message, "raw:", text.slice(0, 200));
    return null;
  }
}

function callClaudeAPI(body: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL("/v1/messages", VISION_API_URL);
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload)
        }
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const responseBody = Buffer.concat(chunks).toString("utf-8");
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(responseBody));
            } catch (err) {
              reject(new Error(`Invalid JSON response: ${responseBody.slice(0, 200)}`));
            }
          } else {
            reject(new Error(`API ${res.statusCode}: ${responseBody.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function analyzeScreenWithVision(screenshotBuffer, context) {
  if (!isVisionAvailable() || !screenshotBuffer) return null;

  const { task, persona, step, previousActions = [], runSeed, project } = context;
  const base64 = screenshotBuffer.toString("base64");

  const body = {
    model: VISION_MODEL,
    max_tokens: VISION_MAX_TOKENS,
    system: buildSystemPrompt(),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: base64
            }
          },
          {
            type: "text",
            text: buildUserPrompt(task, persona, step, task.max_steps, previousActions, runSeed, project)
          }
        ]
      }
    ]
  };

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await callClaudeAPI(body);
      const cost = estimateCostUsd(response.usage);
      totalSpendUsd += cost;
      totalCalls += 1;
      console.log(`[vision] Call #${totalCalls} cost: $${cost.toFixed(4)} | total: $${totalSpendUsd.toFixed(4)} / $${VISION_SPEND_LIMIT_USD}`);
      const text = response.content && response.content[0] && response.content[0].text;
      if (!text) {
        console.error("[vision] Empty response from Claude");
        return null;
      }
      console.log("[vision] Claude response:", text.slice(0, 200));
      return parseVisionResponse(text);
    } catch (error: any) {
      lastError = error;
      console.error(`[vision] Attempt ${attempt + 1} failed:`, error.message);
      if (error.message.includes("429") && attempt === 0) {
        await sleep(VISION_RETRY_DELAY_MS);
        continue;
      }
      break;
    }
  }

  console.error("[vision] All attempts failed:", lastError?.message);
  return null;
}

export async function analyzeFirstImpression(screenshotBuffer, context) {
  if (!isVisionAvailable() || !screenshotBuffer) return null;
  const { task, persona } = context;
  const base64 = screenshotBuffer.toString("base64");

  const system = [
    "Eres una persona real haciendo una prueba de 5 segundos: mirás una pantalla por unos pocos segundos y reportás qué te llamó la atención y qué entendiste.",
    "Devolvé SOLO un JSON con estos campos:",
    "- screenDescription (string, max 80 chars): qué pensás que es esta pantalla.",
    "- attentionPoints: array de 4-7 objetos con {x, y, weight (0-1), label (string max 40 chars)} — los puntos donde tu mirada se detuvo, en orden de impacto.",
    "- scanpath: array de 4-7 objetos con {x, y, order (1..N)} representando el orden en que tus ojos se movieron por la pantalla.",
    "- firstImpression (string, max 240 chars): tu primera impresión en primera persona, think-aloud.",
    "- taskRelevance (number 0-100): qué tan claro queda que esta pantalla sirve para la tarea dada.",
    "- understoodPurpose (string, max 120 chars): qué entendiste que ofrece esta pantalla.",
    "Coordenadas en pixeles desde el top-left de la imagen."
  ].join("\n");

  const user = [
    `Tarea contextual: ${task.prompt}`,
    `Persona: ${persona.role || persona.name}`,
    "Mirá la pantalla 5 segundos y respondé."
  ].join("\n");

  const body = {
    model: VISION_MODEL,
    max_tokens: VISION_MAX_TOKENS,
    system,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: base64 } },
        { type: "text", text: user }
      ]
    }]
  };

  try {
    const response = await callClaudeAPI(body);
    const cost = estimateCostUsd(response.usage);
    totalSpendUsd += cost;
    totalCalls += 1;
    const text = response.content && response.content[0] && response.content[0].text;
    if (!text) return null;
    let raw = text.trim();
    const fence = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    if (fence) raw = fence[1].trim();
    const obj = JSON.parse(raw);
    return {
      screenDescription: String(obj.screenDescription || "").slice(0, 80),
      attentionPoints: Array.isArray(obj.attentionPoints) ? obj.attentionPoints.slice(0, 8).map((p) => ({
        x: Math.round(Number(p.x) || 0),
        y: Math.round(Number(p.y) || 0),
        weight: Math.max(0, Math.min(1, Number(p.weight) || 0.5)),
        label: String(p.label || "").slice(0, 40)
      })) : [],
      scanpath: Array.isArray(obj.scanpath) ? obj.scanpath.slice(0, 8).map((p, i) => ({
        x: Math.round(Number(p.x) || 0),
        y: Math.round(Number(p.y) || 0),
        order: Number(p.order) || (i + 1)
      })) : [],
      firstImpression: String(obj.firstImpression || "").slice(0, 240),
      taskRelevance: Math.max(0, Math.min(100, Number(obj.taskRelevance) || 50)),
      understoodPurpose: String(obj.understoodPurpose || "").slice(0, 120)
    };
  } catch (error: any) {
    console.error("[vision/firstImpression]", error.message);
    return null;
  }
}

export function mapVisionCoordsToPage(visionX, visionY, frame) {
  if (!frame) return { x: visionX, y: visionY };
  const x = Math.round(Math.max(frame.left, Math.min(frame.left + frame.width, frame.left + visionX)));
  const y = Math.round(Math.max(frame.top, Math.min(frame.top + frame.height, frame.top + visionY)));
  return { x, y };
}
