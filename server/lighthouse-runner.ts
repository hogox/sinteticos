import { LIGHTHOUSE_ENABLED, LIGHTHOUSE_TIMEOUT_MS } from "./config.ts";
import { getPlaywright } from "./runner.ts";

const KEY_AUDITS = [
  "first-contentful-paint",
  "largest-contentful-paint",
  "total-blocking-time",
  "cumulative-layout-shift",
  "interactive",
  "speed-index",
  "color-contrast",
  "button-name"
];

export async function runLighthouse(url, { formFactor = "desktop" } = {}) {
  if (!LIGHTHOUSE_ENABLED) return null;

  let lighthouse, chromeLauncher;
  try {
    const [lhMod, clMod] = await Promise.all([
      import("lighthouse"),
      import("chrome-launcher")
    ]);
    lighthouse = (lhMod as any).default;
    chromeLauncher = (clMod as any).default ?? clMod;
  } catch {
    console.warn("[lighthouse] Packages not installed — skipping audit.");
    return null;
  }

  const playwright = await getPlaywright();
  if (!playwright) return null;

  let executablePath;
  try {
    executablePath = playwright.chromium.executablePath();
  } catch {
    return null;
  }

  let chrome;
  try {
    chrome = await chromeLauncher.launch({
      chromePath: executablePath,
      chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu", "--disable-extensions"]
    });

    const result = await Promise.race([
      lighthouse(url, {
        port: chrome.port,
        output: "json",
        logLevel: "error",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
        formFactor,
        screenEmulation:
          formFactor === "mobile"
            ? { mobile: true, width: 375, height: 812, deviceScaleFactor: 3 }
            : { mobile: false, width: 1280, height: 800, deviceScaleFactor: 1 },
        throttlingMethod: "simulate"
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Lighthouse timeout")), LIGHTHOUSE_TIMEOUT_MS)
      )
    ]);

    if (!result || !result.lhr) return null;
    return normalizeLighthouseResult(result.lhr);
  } catch (error: any) {
    console.error("[lighthouse] Error durante auditoria:", error.message);
    return null;
  } finally {
    if (chrome) {
      try { await chrome.kill(); } catch {}
    }
  }
}

function normalizeLighthouseResult(lhr) {
  const cats = lhr.categories || {};
  return {
    url: lhr.finalDisplayedUrl || lhr.requestedUrl,
    fetch_time: lhr.fetchTime,
    lighthouse_version: lhr.lighthouseVersion,
    scores: {
      performance: scoreToInt(cats.performance),
      accessibility: scoreToInt(cats.accessibility),
      best_practices: scoreToInt(cats["best-practices"]),
      seo: scoreToInt(cats.seo)
    },
    audits: extractKeyAudits(lhr.audits || {})
  };
}

function scoreToInt(cat) {
  if (!cat || typeof cat.score !== "number") return null;
  return Math.round(cat.score * 100);
}

function extractKeyAudits(audits) {
  const result = {};
  for (const key of KEY_AUDITS) {
    if (audits[key]) {
      result[key] = {
        title: audits[key].title,
        display_value: audits[key].displayValue || null,
        score: audits[key].score
      };
    }
  }
  return result;
}
