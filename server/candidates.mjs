import { tokenize } from "./utils.mjs";

export async function collectCandidates(page, interactionFrame = null) {
  return page.evaluate((frame) => {
    const selectors = ["a", "button", "[role='button']", "[tabindex='0']", "[data-testid]"];
    const nodes = Array.from(document.querySelectorAll(selectors.join(",")));
    return nodes
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const text = (node.innerText || node.getAttribute("aria-label") || node.getAttribute("title") || "").trim();
        if (rect.width < 24 || rect.height < 24 || rect.top < 0 || rect.left < 0) {
          return null;
        }
        if (rect.bottom > window.innerHeight + 32 || rect.right > window.innerWidth + 32) {
          return null;
        }
        if (rect.width > window.innerWidth * 0.96 || rect.height > 180) {
          return null;
        }
        if (text.length > 90) {
          return null;
        }
        const computed = window.getComputedStyle(node);
        if (computed.pointerEvents === "none" || computed.visibility === "hidden" || computed.display === "none") {
          return null;
        }
        if (frame) {
          const centerX = rect.x + rect.width / 2;
          const centerY = rect.y + rect.height / 2;
          if (
            centerX < frame.left ||
            centerX > frame.left + frame.width ||
            centerY < frame.top ||
            centerY > frame.top + frame.height
          ) {
            return null;
          }
        }
        return {
          text,
          isRestart: /restart/i.test(text),
          tag: node.tagName.toLowerCase(),
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          centerX: rect.x + rect.width / 2,
          centerY: rect.y + rect.height / 2
        };
      })
      .filter(Boolean)
      .slice(0, 24);
  }, interactionFrame);
}

export function chooseCandidate(candidates, task, persona, rng, step, interactionFrame = null) {
  if (!candidates.length) {
    const fallback = resolveFrameFallbackPoint(interactionFrame, step);
    return {
      type: "coordinate",
      x: fallback.x,
      y: fallback.y,
      centerX: fallback.x,
      centerY: fallback.y,
      reason: interactionFrame
        ? "No encontre elementos semanticos visibles y probe una region probable dentro del frame mobile del prototipo."
        : "No encontre elementos semanticos visibles y probe una region probable del prototipo.",
      score: 44
    };
  }

  const tokens = tokenize(`${task.prompt} ${task.success_criteria}`);
  const scored = candidates
    .map((candidate) => {
      const textTokens = tokenize(candidate.text);
      const textOverlap = textTokens.filter((token) => tokens.includes(token)).length;
      const ctaBias = candidate.centerY > 500 ? 18 : 0;
      const clarityBias = persona.digital_level === "low" && candidate.text ? 12 : 0;
      const cookieBias = /(allow all cookies|do not allow cookies|cookie settings|accept|reject)/i.test(candidate.text) ? 32 : 0;
      const noisePenalty = /(cookies?|sign up|log in|login|register)/i.test(candidate.text) && !/(allow all cookies|do not allow cookies)/i.test(candidate.text) ? 18 : 0;
      const restartPenalty = candidate.isRestart ? 24 : 0;
      const shortLabelBias = candidate.text && candidate.text.length <= 28 ? 8 : 0;
      const score = 40 + textOverlap * 14 + ctaBias + clarityBias + cookieBias + shortLabelBias - noisePenalty - restartPenalty - step * 2;
      return { ...candidate, score };
    })
    .sort((a, b) => b.score - a.score);

  const chosen = scored[0];
  return {
    ...chosen,
    type: "candidate",
    reason: chosen.text
      ? `Hice click en "${chosen.text}" porque parecia la accion mas coherente con la tarea.`
      : "Probe la zona clickeable mas prominente disponible."
  };
}

function resolveFrameFallbackPoint(frame, step) {
  const pattern = step % 3 === 1 ? { x: 0.5, y: 0.78 } : step % 3 === 2 ? { x: 0.5, y: 0.45 } : { x: 0.5, y: 0.24 };
  return resolveRelativeFramePoint(frame || { left: 0, top: 0, width: 390, height: 844 }, pattern);
}

function resolveRelativeFramePoint(frame, point) {
  const baseFrame = frame || { left: 0, top: 0, width: 390, height: 844 };
  return {
    x: Math.round(baseFrame.left + baseFrame.width * point.x),
    y: Math.round(baseFrame.top + baseFrame.height * point.y),
    label: point.label
  };
}
