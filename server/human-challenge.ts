/**
 * Detects and attempts to solve interactive human-verification challenges
 * (Cloudflare Turnstile, hCaptcha, reCAPTCHA v2).
 *
 * Only handles checkbox-style interactive challenges — auto-resolving Managed
 * Challenges are handled separately by waitForCloudflare() in navigation-run.ts.
 */

interface ChallengeResult {
  found: boolean;
  type: string | null;
  resolved: boolean;
}

const TURNSTILE_HOST = "challenges.cloudflare.com";
const HCAPTCHA_HOST = "hcaptcha.com";
const RECAPTCHA_HOST = "google.com/recaptcha";

// Selectors tried in order inside each challenge iframe
const CHECKBOX_SELECTORS_TURNSTILE = [
  'input[type="checkbox"]',
  ".ctp-checkbox-label",
  "[role='checkbox']",
  "label",
];

const CHECKBOX_SELECTORS_HCAPTCHA = [
  "#checkbox",
  ".check",
  '[aria-checked]',
  "label",
];

const CHECKBOX_SELECTORS_RECAPTCHA = [
  "#recaptcha-anchor",
  ".rc-anchor-checkbox",
  ".recaptcha-checkbox",
  "[role='checkbox']",
];

async function clickInsideFrame(
  page: any,
  frame: any,
  selectors: string[]
): Promise<boolean> {
  for (const sel of selectors) {
    try {
      await frame.waitForSelector(sel, { timeout: 2000, state: "visible" });
      await frame.click(sel, { timeout: 2000 });
      return true;
    } catch {
      // try next selector
    }
  }
  return false;
}

async function clickIframeCenter(page: any, srcPattern: string): Promise<boolean> {
  try {
    const iframeEl = await page.$(`iframe[src*="${srcPattern}"]`);
    if (!iframeEl) return false;
    const box = await iframeEl.boundingBox();
    if (!box) return false;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    return true;
  } catch {
    return false;
  }
}

/**
 * Scans for interactive human-verification challenges and attempts to dismiss
 * them by clicking the checkbox/button. Returns a result describing what was
 * found and whether a click was issued.
 *
 * After a successful click the caller should wait a few seconds for the
 * challenge to auto-resolve before proceeding.
 */
export async function detectAndSolveHumanChallenge(page: any): Promise<ChallengeResult> {
  // Helper: find a frame by URL pattern among all already-loaded frames
  const findFrame = (hostPattern: string) =>
    (page.frames() as any[]).find((f) => f.url().includes(hostPattern)) || null;

  // ── Cloudflare Turnstile ──────────────────────────────────────────────────
  const turnstileFrame = findFrame(TURNSTILE_HOST);
  if (turnstileFrame) {
    console.log("[challenge] Cloudflare Turnstile interactive challenge detected");
    let clicked = await clickInsideFrame(page, turnstileFrame, CHECKBOX_SELECTORS_TURNSTILE);
    if (!clicked) clicked = await clickIframeCenter(page, TURNSTILE_HOST);
    if (clicked) {
      console.log("[challenge] Turnstile checkbox clicked, waiting for resolution...");
      await page.waitForTimeout(5000);
      const resolved = !findFrame(TURNSTILE_HOST);
      if (resolved) console.log("[challenge] Turnstile challenge resolved");
      else console.log("[challenge] Turnstile still visible — may need manual solve");
      return { found: true, type: "turnstile", resolved };
    }
    return { found: true, type: "turnstile", resolved: false };
  }

  // ── hCaptcha ──────────────────────────────────────────────────────────────
  const hcaptchaFrame = findFrame(HCAPTCHA_HOST);
  if (hcaptchaFrame) {
    console.log("[challenge] hCaptcha challenge detected");
    let clicked = await clickInsideFrame(page, hcaptchaFrame, CHECKBOX_SELECTORS_HCAPTCHA);
    if (!clicked) clicked = await clickIframeCenter(page, "hcaptcha.com");
    if (clicked) {
      console.log("[challenge] hCaptcha checkbox clicked, waiting...");
      await page.waitForTimeout(4000);
      const resolved = !findFrame(HCAPTCHA_HOST);
      return { found: true, type: "hcaptcha", resolved };
    }
    return { found: true, type: "hcaptcha", resolved: false };
  }

  // ── reCAPTCHA v2 ──────────────────────────────────────────────────────────
  const recaptchaFrame = findFrame("recaptcha");
  if (recaptchaFrame) {
    console.log("[challenge] reCAPTCHA v2 challenge detected");
    let clicked = await clickInsideFrame(page, recaptchaFrame, CHECKBOX_SELECTORS_RECAPTCHA);
    if (!clicked) clicked = await clickIframeCenter(page, "recaptcha");
    if (clicked) {
      console.log("[challenge] reCAPTCHA checkbox clicked, waiting...");
      await page.waitForTimeout(4000);
      return { found: true, type: "recaptcha", resolved: true };
    }
    return { found: true, type: "recaptcha", resolved: false };
  }

  return { found: false, type: null, resolved: false };
}

/**
 * Polls for a human challenge up to `maxAttempts` times with a 1-second
 * gap between checks. Useful right after navigation when the challenge iframe
 * may not have loaded yet.
 */
export async function waitAndSolveHumanChallenge(
  page: any,
  maxWaitMs = 10000
): Promise<ChallengeResult> {
  const pollInterval = 1000;
  const attempts = Math.ceil(maxWaitMs / pollInterval);
  for (let i = 0; i < attempts; i++) {
    const result = await detectAndSolveHumanChallenge(page);
    if (result.found) return result;
    await page.waitForTimeout(pollInterval);
  }
  return { found: false, type: null, resolved: false };
}
