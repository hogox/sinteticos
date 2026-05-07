import path from "node:path";
import { promises as fs } from "node:fs";
import { execFile, VISUAL_FRAME_DETECTION_TIMEOUT_MS } from "./config.ts";
import { escapeXml } from "../shared/utils.js";

export async function detectVisualMobileFrame(page) {
  try {
    const screenshot = await withTimeout(
      page.screenshot({ type: "png", fullPage: false }),
      VISUAL_FRAME_DETECTION_TIMEOUT_MS,
      "visual-frame-screenshot-timeout"
    );
    const script = `
import io, json, sys
from PIL import Image

raw = sys.stdin.buffer.read()
im = Image.open(io.BytesIO(raw)).convert("RGB")
w, h = im.size
if w <= 0 or h <= 0:
    print("null")
    raise SystemExit(0)

left_bound = int(w * 0.18)
right_bound = int(w * 0.82)
top_bound = int(h * 0.08)
bottom_bound = int(h * 0.94)

mask_points = []
for y in range(top_bound, bottom_bound, 3):
    row_hits = []
    for x in range(left_bound, right_bound, 3):
        r, g, b = im.getpixel((x, y))
        brightness = (r + g + b) / 3
        if brightness > 105:
            row_hits.append(x)
    if len(row_hits) >= max(8, int((right_bound - left_bound) * 0.04 / 3)):
        mask_points.append((min(row_hits), max(row_hits), y))

if not mask_points:
    print("null")
    raise SystemExit(0)

xs_min = min(item[0] for item in mask_points)
xs_max = max(item[1] for item in mask_points)
ys_min = min(item[2] for item in mask_points)
ys_max = max(item[2] for item in mask_points)

width = xs_max - xs_min
height = ys_max - ys_min
if width < w * 0.08 or height < h * 0.22:
    print("null")
    raise SystemExit(0)

center_x = xs_min + width / 2
center_distance = abs(center_x - (w / 2))
confidence = 0.35
if width >= w * 0.12:
    confidence += 0.15
if height >= h * 0.35:
    confidence += 0.15
if center_distance <= w * 0.08:
    confidence += 0.2
aspect = height / max(width, 1)
if 1.45 <= aspect <= 2.6:
    confidence += 0.1

result = {
    "left": int(xs_min),
    "top": int(ys_min),
    "width": int(width),
    "height": int(height),
    "confidence": round(min(confidence, 0.95), 3)
}
print(json.dumps(result))
`;
    const { stdout } = (await withTimeout(
      execFile("python3", ["-c", script], {
        input: screenshot,
        maxBuffer: 1024 * 1024 * 10,
        timeout: VISUAL_FRAME_DETECTION_TIMEOUT_MS
      } as any),
      VISUAL_FRAME_DETECTION_TIMEOUT_MS + 200,
      "visual-frame-python-timeout"
    )) as any;
    const raw = String(stdout || "").trim();
    if (!raw || raw === "null") {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !Number.isFinite(parsed.left) || !Number.isFinite(parsed.top)) {
      return null;
    }
    return parsed;
  } catch (error: any) {
    return null;
  }
}

export function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(label));
    }, timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function writeFrameDebugArtifact(runDir, runId, screen, frame, debugArtifacts, viewport) {
  if (!frame || !viewport) {
    return;
  }
  const filename = `frame-debug-${String(debugArtifacts.length + 1).padStart(2, "0")}.svg`;
  const absolutePath = path.join(runDir, filename);
  const svg = buildFrameDebugSvg(frame, viewport, screen);
  await fs.writeFile(absolutePath, svg, "utf8");
  debugArtifacts.push({
    type: "interaction-frame",
    screen,
    src: `/artifacts/${runId}/${filename}`,
    confidence: frame.confidence
  });
}

export function buildFrameDebugSvg(frame, viewport, screen) {
  const width = viewport.width || 390;
  const height = viewport.height || 844;
  const confidence = Number.isFinite(frame.confidence) ? frame.confidence.toFixed(2) : "n/a";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `<rect width="${width}" height="${height}" fill="#050505"/>`,
    `<rect x="${frame.left}" y="${frame.top}" width="${frame.width}" height="${frame.height}" rx="18" fill="rgba(255,255,255,0.10)" stroke="#35d07f" stroke-width="3"/>`,
    `<rect x="${frame.left}" y="${frame.top}" width="${frame.width}" height="28" fill="rgba(53,208,127,0.16)"/>`,
    `<text x="20" y="28" fill="#f4f4f4" font-family="Menlo, monospace" font-size="14">interaction frame debug</text>`,
    `<text x="20" y="48" fill="#c9c9c9" font-family="Menlo, monospace" font-size="12">screen: ${escapeXml(screen || "unknown")}</text>`,
    `<text x="20" y="66" fill="#c9c9c9" font-family="Menlo, monospace" font-size="12">confidence: ${confidence}</text>`,
    `<text x="20" y="84" fill="#c9c9c9" font-family="Menlo, monospace" font-size="12">box: x=${Math.round(frame.left)} y=${Math.round(frame.top)} w=${Math.round(frame.width)} h=${Math.round(frame.height)}</text>`,
    `</svg>`
  ].join("");
}

export function buildFrameDebugDataUrl(frame, viewport, screen) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildFrameDebugSvg(frame, viewport, screen))}`;
}
