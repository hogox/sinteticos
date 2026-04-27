import path from "node:path";
import { buildScreenSvg } from "../shared/screen-svg.js";

export async function fingerprintPage(page) {
  return page.evaluate(() => {
    const title = document.title || "";
    const text = (document.body && document.body.innerText ? document.body.innerText : "").slice(0, 180);
    return `${location.href}|${title}|${text}`;
  });
}

export async function getScreenLabel(page, step) {
  return page.evaluate((index) => {
    const title = document.title || "";
    const heading = document.querySelector("h1, h2, [role='heading']");
    const headingText = heading ? heading.textContent.trim() : "";
    return headingText || title || `Screen ${index}`;
  }, step);
}

export async function captureScreenshot(page, runDir, screenshots, screen, step, runId, clip) {
  const filename = `step-${String(step).padStart(2, "0")}.png`;
  const absolutePath = path.join(runDir, filename);
  const opts = { path: absolutePath, fullPage: false };
  if (clip && clip.confidence > 0.5 && clip.left >= 0 && clip.top >= 0) {
    opts.clip = { x: clip.left, y: clip.top, width: clip.width, height: clip.height };
  }
  await page.screenshot(opts);
  screenshots.push({
    screen,
    step,
    src: `/artifacts/${runId}/${filename}`
  });
}

export async function safeCaptureScreenshot(page, runDir, screenshots, screen, step, runId, clip) {
  if (!page || isPageUnavailable(page)) {
    screenshots.push({
      screen,
      step,
      src: buildScreenSvg(screen, { type: "navigation", url: "" }, { name: "Fallback" }, step - 1)
    });
    return;
  }
  try {
    await captureScreenshot(page, runDir, screenshots, screen, step, runId, clip);
  } catch (error) {
    screenshots.push({
      screen,
      step,
      src: buildScreenSvg(screen, { type: "navigation", url: "" }, { name: "Fallback" }, step - 1)
    });
  }
}

export async function safeFingerprintPage(page) {
  if (!page || isPageUnavailable(page)) {
    return `closed:${Date.now()}`;
  }
  try {
    return await fingerprintPage(page);
  } catch (error) {
    return `closed:${Date.now()}`;
  }
}

export async function safeGetScreenLabel(page, step) {
  if (!page || isPageUnavailable(page)) {
    return `Screen ${step}`;
  }
  try {
    return await getScreenLabel(page, step);
  } catch (error) {
    return `Screen ${step}`;
  }
}

export function isPageUnavailable(page) {
  try {
    return page.isClosed();
  } catch (error) {
    return true;
  }
}
