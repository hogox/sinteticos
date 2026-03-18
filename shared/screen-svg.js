import { escapeXml, getHostLabel } from "./utils.js";

export function buildScreenSvg(screen, task, persona, index, options = {}) {
  const accent = ["#ff6f3c", "#0f8b8d", "#6f8f3f", "#d1481f"][index % 4];
  const subtitle = task.type === "navigation" ? getHostLabel(task.url || "figma.com") : persona.name;
  const extraElements = options.extended
    ? `<rect x="24" y="420" width="312" height="74" rx="22" fill="${accent}" opacity="0.18" />
      <text x="38" y="150" fill="#191919" font-family="Avenir Next, sans-serif" font-size="14">Synthetic screenshot</text>
      <text x="38" y="172" fill="#5d5548" font-family="Avenir Next, sans-serif" font-size="12">Observed artifact generated locally</text>`
    : "";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="360" height="640">
      <rect width="360" height="640" rx="28" fill="#fdf8f1" />
      <rect x="24" y="26" width="312" height="64" rx="18" fill="${accent}" opacity="0.16" />
      <rect x="24" y="112" width="312" height="120" rx="22" fill="#ffffff" stroke="rgba(0,0,0,0.08)" />
      <rect x="24" y="254" width="150" height="144" rx="20" fill="#ffffff" stroke="rgba(0,0,0,0.08)" />
      <rect x="186" y="254" width="150" height="144" rx="20" fill="#ffffff" stroke="rgba(0,0,0,0.08)" />
      ${extraElements}
      <text x="32" y="58" fill="#191919" font-family="Avenir Next, sans-serif" font-size="16" font-weight="700">${escapeXml(screen)}</text>
      <text x="32" y="78" fill="#5d5548" font-family="Avenir Next, sans-serif" font-size="12">${escapeXml(subtitle)}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
