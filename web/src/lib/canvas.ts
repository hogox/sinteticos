interface Point {
  x: number;
  y: number;
  weight?: number;
}

export function loadImage(src: string | null): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function drawBackground(canvas: HTMLCanvasElement, img: HTMLImageElement | null, title = "") {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  if (img) {
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    canvas.width = 360;
    canvas.height = 640;
    ctx.fillStyle = "#fdf8f1";
    ctx.fillRect(0, 0, 360, 640);
    ctx.fillStyle = "#191919";
    ctx.font = "700 16px system-ui";
    ctx.fillText(title, 24, 40);
  }
}

export function drawHeatPoints(canvas: HTMLCanvasElement, points: Point[], predictive = false) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  points.forEach((point) => {
    const radius = predictive ? 80 : 60;
    const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
    gradient.addColorStop(0, predictive ? "rgba(15,139,141,0.42)" : "rgba(255,111,60,0.45)");
    gradient.addColorStop(0.45, predictive ? "rgba(15,139,141,0.16)" : "rgba(255,111,60,0.18)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function drawScanPoints(canvas: HTMLCanvasElement, points: Point[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx || !points.length) return;
  ctx.strokeStyle = "rgba(15,139,141,0.86)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.stroke();
  points.forEach((point, idx) => {
    ctx.fillStyle = "#0f8b8d";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 10 + Math.max(2, Math.round((point.weight || 0.3) * 4)), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "700 11px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(idx + 1), point.x, point.y);
  });
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}
