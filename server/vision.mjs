import https from "node:https";
import {
  ANTHROPIC_API_KEY,
  VISION_MODEL,
  VISION_MAX_TOKENS,
  VISION_API_URL,
  VISION_RETRY_DELAY_MS,
  VISION_SPEND_LIMIT_USD
} from "./config.mjs";

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
    "You are a UX testing agent navigating a mobile app prototype.",
    "You see a screenshot of ONLY the prototype content area — no margins, no browser chrome, no surrounding UI.",
    "The entire image IS the app screen.",
    "Your job is to identify the single best element to tap/click to advance the user's goal.",
    "",
    "Return ONLY a valid JSON object (no markdown, no fences, no explanation) with these fields:",
    "- x (number): horizontal pixel coordinate to click, relative to the screenshot top-left (which is the prototype top-left)",
    "- y (number): vertical pixel coordinate to click, relative to the screenshot top-left (which is the prototype top-left)",
    "- screenDescription (string, max 60 chars): short description of what this screen shows",
    "- reason (string, max 120 chars): why you are clicking there",
    "- certainty (number 0-100): how confident you are this is the right action",
    "- taskComplete (boolean): true if the task goal appears to already be achieved on this screen",
    "",
    "Click on visible, interactive-looking elements like buttons, links, tabs, or form fields.",
    "Prefer elements that clearly advance the stated task goal.",
    "If the screen shows a success/confirmation state, set taskComplete to true."
  ].join("\n");
}

function buildUserPrompt(task, persona, step, maxSteps, previousActions) {
  const lines = [
    `Task: ${task.prompt}`,
    `Success criteria: ${task.success_criteria || "Complete the task flow."}`,
    `Persona: ${persona.role || persona.name} (digital level: ${persona.digital_level || "medium"})`,
    `Step ${step} of ${maxSteps}`
  ];
  if (previousActions.length > 0) {
    lines.push("", "Previous actions:");
    for (const action of previousActions) {
      lines.push(`  - ${action}`);
    }
  }
  lines.push("", "Look at this screenshot and decide where to click next to advance the task.");
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
    if (typeof obj.x !== "number" || typeof obj.y !== "number") return null;
    return {
      x: Math.round(obj.x),
      y: Math.round(obj.y),
      screenDescription: String(obj.screenDescription || "").slice(0, 60),
      reason: String(obj.reason || "").slice(0, 120),
      certainty: Math.max(0, Math.min(100, Number(obj.certainty) || 50)),
      taskComplete: Boolean(obj.taskComplete)
    };
  } catch (error) {
    console.error("[vision] JSON parse failed:", error.message, "raw:", text.slice(0, 200));
    return null;
  }
}

function callClaudeAPI(body) {
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

  const { task, persona, step, previousActions = [] } = context;
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
            text: buildUserPrompt(task, persona, step, task.max_steps, previousActions)
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
    } catch (error) {
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

export function mapVisionCoordsToPage(visionX, visionY, frame) {
  if (!frame) return { x: visionX, y: visionY };
  const x = Math.round(Math.max(frame.left, Math.min(frame.left + frame.width, frame.left + visionX)));
  const y = Math.round(Math.max(frame.top, Math.min(frame.top + frame.height, frame.top + visionY)));
  return { x, y };
}
