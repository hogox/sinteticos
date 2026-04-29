import Anthropic from "@anthropic-ai/sdk";

const ANTHROPIC_DEFAULT = "claude-sonnet-4-6";
const OPENAI_DEFAULT = "gpt-4o-mini";
const GOOGLE_DEFAULT = "gemini-2.5-pro";

let anthropicClient = null;
function getAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

async function chatAnthropic({ system, user, model }) {
  const client = getAnthropicClient();
  if (!client) {
    const error = new Error("ANTHROPIC_API_KEY no está definida.");
    error.code = "PROVIDER_KEY_MISSING";
    throw error;
  }
  const response = await client.messages.create({
    model: model || ANTHROPIC_DEFAULT,
    max_tokens: 4096,
    temperature: 0.3,
    system,
    messages: [{ role: "user", content: user }]
  });
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  return { text, model: response.model || model || ANTHROPIC_DEFAULT };
}

async function chatOpenAI({ system, user, model }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error("OPENAI_API_KEY no está definida.");
    error.code = "PROVIDER_KEY_MISSING";
    throw error;
  }
  const usedModel = model || OPENAI_DEFAULT;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: usedModel,
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      response_format: { type: "json_object" }
    })
  });
  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`OpenAI ${response.status}: ${body.slice(0, 200)}`);
    error.code = "PROVIDER_HTTP_ERROR";
    throw error;
  }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  return { text, model: data.model || usedModel };
}

async function chatGoogle({ system, user, model }) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    const error = new Error("GOOGLE_API_KEY no está definida.");
    error.code = "PROVIDER_KEY_MISSING";
    throw error;
  }
  const usedModel = model || GOOGLE_DEFAULT;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(usedModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json"
      }
    })
  });
  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`Google ${response.status}: ${body.slice(0, 200)}`);
    error.code = "PROVIDER_HTTP_ERROR";
    throw error;
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n") || "";
  return { text, model: usedModel };
}

const PROVIDERS = {
  anthropic: { chat: chatAnthropic, defaultModel: ANTHROPIC_DEFAULT },
  openai: { chat: chatOpenAI, defaultModel: OPENAI_DEFAULT },
  google: { chat: chatGoogle, defaultModel: GOOGLE_DEFAULT }
};

export function listAvailableProviders() {
  const out = [];
  if (process.env.ANTHROPIC_API_KEY) out.push("anthropic");
  if (process.env.OPENAI_API_KEY) out.push("openai");
  if (process.env.GOOGLE_API_KEY) out.push("google");
  return out;
}

export function getDefaultProvider() {
  const requested = (process.env.SKILLS_PROVIDER || "").toLowerCase();
  const available = listAvailableProviders();
  if (requested && available.includes(requested)) return requested;
  return available[0] || null;
}

export async function callProvider(providerName, { system, user, model }) {
  const provider = PROVIDERS[providerName];
  if (!provider) {
    const error = new Error(`Proveedor desconocido: ${providerName}`);
    error.code = "UNKNOWN_PROVIDER";
    throw error;
  }
  const started = Date.now();
  const { text, model: usedModel } = await provider.chat({ system, user, model });
  return { text, model: usedModel, latency_ms: Date.now() - started };
}
