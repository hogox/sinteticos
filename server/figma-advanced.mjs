import { isPageUnavailable } from "./page-inspect.mjs";
import { safeFingerprintPage, safeGetScreenLabel } from "./page-inspect.mjs";
import { detectVisualMobileFrame } from "./frame-detection.mjs";
import {
  prepareFigmaSurface,
  inspectBlockingSurface,
  hasMeaningfulInteractiveTargets
} from "./figma-surface.mjs";

export async function extendFigmaStartupWindow(page, task, deadline, timing) {
  if (!task.url || !/figma\.com\/proto|embed\.figma\.com\/proto/i.test(task.url) || !timing.startupGraceMs) {
    return { kind: "skipped" };
  }

  const startupDeadline = Math.min(deadline, Date.now() + timing.startupGraceMs);
  while (Date.now() < startupDeadline) {
    const blocking = await inspectBlockingSurface(page);
    if (blocking.kind === "login-wall") {
      return blocking;
    }
    if (blocking.kind === "loading" || blocking.kind === "restart-ready" || blocking.kind === "cookies") {
      await prepareFigmaSurface(page);
      await page.waitForTimeout(timing.interactiveWaitMs);
      continue;
    }

    const currentLabel = await safeGetScreenLabel(page, 1);
    const interactionFrame = await getInteractionFrame(page, task);
    const targetsReady = await hasMeaningfulInteractiveTargets(page, interactionFrame);
    if ((interactionFrame && interactionFrame.confidence >= 0.55) || (targetsReady && !looksLikeStaticPrototypeShell(currentLabel, task))) {
      return { kind: "ready" };
    }
    if (targetsReady) {
      return { kind: "ready" };
    }

    await prepareFigmaSurface(page);
    await page.waitForTimeout(timing.interactiveWaitMs);
  }

  return { kind: "timeout" };
}

export async function attemptBlindWakeSequence(page, task, deadline, timing) {
  if (!timing.blindWakeEnabled || !task.url || !/figma\.com\/proto|embed\.figma\.com\/proto/i.test(task.url)) {
    return { kind: "skipped" };
  }

  const interactionFrame = (await getInteractionFrame(page, task)) || inferCenteredMobileFrame(page.viewportSize());
  let previousFingerprint = await safeFingerprintPage(page);
  for (const point of timing.blindWakePoints) {
    if (Date.now() >= deadline) {
      return { kind: "timeout" };
    }
    const absolutePoint = resolveRelativeFramePoint(interactionFrame, point);
    try {
      await page.mouse.click(absolutePoint.x, absolutePoint.y);
      await page.waitForTimeout(timing.interactiveWaitMs);
    } catch (error) {
    }

    const blocking = await inspectBlockingSurface(page);
    if (blocking.kind === "login-wall") {
      return blocking;
    }

    const nextFingerprint = await safeFingerprintPage(page);
    const refreshedFrame = (await getInteractionFrame(page, task)) || interactionFrame;
    const targetsReady = await hasMeaningfulInteractiveTargets(page, refreshedFrame);
    if (nextFingerprint !== previousFingerprint || targetsReady) {
      return { kind: "ready", point: absolutePoint, frame: refreshedFrame };
    }
    previousFingerprint = nextFingerprint;
  }

  return { kind: "timeout" };
}

export async function getInteractionFrame(page, task = {}) {
  const viewport = safeViewportSize(page);
  if (!page || isPageUnavailable(page)) {
    return inferCenteredMobileFrame(viewport);
  }
  if (!task.url || !/figma\.com\/proto|embed\.figma\.com\/proto/i.test(task.url)) {
    return null;
  }

  // Tier 0: Figma canvas detection
  // Figma renders prototypes into a <canvas> element. With scale-down + device-frame=0,
  // the canvas may not fill the full viewport (e.g. 294x724 in a 390x844 viewport)
  // but it's still the dominant visual element and the correct interaction target.
  try {
    const figmaCanvas = await page.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll("canvas"));
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let best = null;
      for (const c of canvases) {
        const r = c.getBoundingClientRect();
        const area = r.width * r.height;
        const viewportArea = vw * vh;
        if (r.left < 0 || r.left >= vw || r.top + r.height <= 0 || r.top >= vh) continue;
        if (area > viewportArea * 0.4 && r.width >= 200 && r.height >= 400) {
          if (!best || area > best.area) {
            best = { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), area };
          }
        }
      }
      if (best) delete best.area;

      // Detect Figma toolbar overlay at the top of the page
      // This is the bar with logo, title, "Iniciar sesión" / "Crear cuenta" that appears
      // even with hide-ui=1 or in embeds. Exclude it from the interaction frame.
      let toolbarHeight = 0;
      const divs = document.querySelectorAll("div");
      for (const d of divs) {
        const r = d.getBoundingClientRect();
        if (r.top <= 2 && r.height > 30 && r.height < 60 && r.width > vw * 0.8) {
          const btns = d.querySelectorAll("button, a");
          if (btns.length >= 1) {
            toolbarHeight = Math.round(r.height);
            break;
          }
        }
      }
      if (best && toolbarHeight > 0 && best.top < toolbarHeight + 5) {
        const originalTop = best.top;
        best.top = toolbarHeight;
        best.height -= (toolbarHeight - originalTop);
      }

      return best;
    });
    if (figmaCanvas) {
      return { ...figmaCanvas, confidence: 0.85 };
    }
  } catch (error) {
  }

  const visualFrame = await detectVisualMobileFrame(page);
  if (visualFrame && visualFrame.confidence >= 0.5) {
    return visualFrame;
  }

  let detected = null;
  try {
    detected = await page.evaluate(() => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const centerX = viewportWidth / 2;
      const minWidth = Math.max(220, Math.min(280, viewportWidth * 0.18));
      const maxWidth = Math.min(540, viewportWidth * 0.42);
      const minHeight = Math.max(420, viewportHeight * 0.45);
      const maxHeight = Math.min(viewportHeight - 40, viewportHeight * 0.92);
      const nodes = Array.from(document.querySelectorAll("iframe, canvas, img, svg, div"));
      const candidates = nodes
        .map((node) => {
          const rect = node.getBoundingClientRect();
          if (rect.width < minWidth || rect.width > maxWidth) return null;
          if (rect.height < minHeight || rect.height > maxHeight) return null;
          if (rect.top < 0 || rect.bottom > viewportHeight + 8) return null;
          const styles = window.getComputedStyle(node);
          if (styles.display === "none" || styles.visibility === "hidden" || styles.opacity === "0") return null;
          const nodeCenterX = rect.left + rect.width / 2;
          const centerDistance = Math.abs(nodeCenterX - centerX);
          if (centerDistance > viewportWidth * 0.16) return null;
          const aspect = rect.height / Math.max(rect.width, 1);
          if (aspect < 1.45 || aspect > 2.8) return null;
          const areaScore = Math.min(1, (rect.width * rect.height) / (viewportWidth * viewportHeight * 0.16));
          const centerScore = 1 - centerDistance / Math.max(viewportWidth * 0.16, 1);
          const aspectScore = 1 - Math.min(Math.abs(aspect - 2.0), 1);
          const score = areaScore * 0.45 + centerScore * 0.35 + aspectScore * 0.2;
          return {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            confidence: Math.max(0.2, Math.min(0.98, score))
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.confidence - a.confidence);
      return candidates[0] || null;
    });
  } catch (error) {
    detected = null;
  }

  return detected || visualFrame || inferCenteredMobileFrame(viewport);
}

export function inferCenteredMobileFrame(viewport) {
  if (!viewport) {
    return null;
  }
  const width = Math.round(Math.min(360, viewport.width * 0.28));
  const height = Math.round(Math.min(viewport.height - 80, width * 2.05));
  return {
    left: Math.round((viewport.width - width) / 2),
    top: Math.round(Math.max(24, (viewport.height - height) / 2)),
    width,
    height,
    confidence: 0.32
  };
}

export function resolveRelativeFramePoint(frame, point) {
  const baseFrame = frame || { left: 0, top: 0, width: 390, height: 844 };
  return {
    x: Math.round(baseFrame.left + baseFrame.width * point.x),
    y: Math.round(baseFrame.top + baseFrame.height * point.y),
    label: point.label
  };
}

export function resolveFrameFallbackPoint(frame, step) {
  const pattern = step % 3 === 1 ? { x: 0.5, y: 0.78 } : step % 3 === 2 ? { x: 0.5, y: 0.45 } : { x: 0.5, y: 0.24 };
  return resolveRelativeFramePoint(frame || { left: 0, top: 0, width: 390, height: 844 }, pattern);
}

export function safeViewportSize(page) {
  try {
    return page && typeof page.viewportSize === "function" ? page.viewportSize() : null;
  } catch (error) {
    return null;
  }
}

export function looksLikeStaticPrototypeShell(screenLabel, task) {
  const label = String(screenLabel || "").trim().toLowerCase();
  const urlBag = String(task.url || "").toLowerCase();
  if (!label) {
    return true;
  }
  return (
    label.includes("screen 1") ||
    label.includes("figma") ||
    urlBag.includes(encodeURIComponent(label)) ||
    urlBag.includes(label.replace(/\s+/g, "-"))
  );
}

export function looksSuccessful(task, plan, screen) {
  const bag = `${plan.text || ""} ${screen || ""} ${task.success_criteria || ""}`.toLowerCase();
  return ["book", "confirm", "checkout", "reserva", "confirmacion", "success"].some((token) => bag.includes(token));
}
