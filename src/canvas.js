export function drawVisualChrome(ctx, title) {
  ctx.clearRect(0, 0, 360, 640);
  ctx.fillStyle = "#fdf8f1";
  ctx.fillRect(0, 0, 360, 640);
  ctx.fillStyle = "rgba(255,111,60,0.12)";
  roundRect(ctx, 22, 24, 316, 72, 20);
  ctx.fill();
  ctx.fillStyle = "#191919";
  ctx.font = "700 18px Avenir Next";
  ctx.fillText(title, 36, 66);
  ctx.fillStyle = "rgba(0,0,0,0.06)";
  roundRect(ctx, 22, 114, 316, 126, 24);
  ctx.fill();
  roundRect(ctx, 22, 266, 148, 136, 22);
  ctx.fill();
  roundRect(ctx, 190, 266, 148, 136, 22);
  ctx.fill();
  ctx.fillStyle = "rgba(15,139,141,0.1)";
  roundRect(ctx, 22, 426, 316, 86, 24);
  ctx.fill();
}

export function drawHeatPoints(ctx, points, predictive) {
  (points || []).forEach((point) => {
    const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, predictive ? 80 : 60);
    gradient.addColorStop(0, predictive ? "rgba(15,139,141,0.42)" : "rgba(255,111,60,0.45)");
    gradient.addColorStop(0.45, predictive ? "rgba(15,139,141,0.16)" : "rgba(255,111,60,0.18)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(point.x, point.y, predictive ? 78 : 58, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function drawScanPoints(ctx, points) {
  if (!points || !points.length) {
    return;
  }
  ctx.strokeStyle = "rgba(15,139,141,0.86)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.stroke();
  points.forEach((point, index) => {
    ctx.fillStyle = "#0f8b8d";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 10 + Math.max(2, Math.round((point.weight || 0.3) * 4)), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "700 11px Avenir Next";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(index + 1), point.x, point.y);
  });
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

export function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
