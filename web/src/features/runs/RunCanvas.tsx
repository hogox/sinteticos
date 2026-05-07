import { useEffect, useRef } from "react";
import { useUI } from "@/stores/ui";
import { drawBackground, drawHeatPoints, drawScanPoints, loadImage } from "@/lib/canvas";

interface Point {
  x: number;
  y: number;
  weight?: number;
}

interface Props {
  imageSrc?: string | null;
  points: Point[];
  mode: "heatmap" | "scanpath";
  predictive?: boolean;
  title?: string;
  className?: string;
}

export function RunCanvas({ imageSrc, points, mode, predictive = false, title = "", className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const setLightboxSrc = useUI((s) => s.setLightboxSrc);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const canvas = ref.current;
      if (!canvas) return;
      const img = await loadImage(imageSrc || null);
      if (cancelled) return;
      drawBackground(canvas, img, title);
      if (mode === "heatmap") {
        drawHeatPoints(canvas, points, predictive);
      } else {
        drawScanPoints(canvas, points);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageSrc, points, mode, predictive, title]);

  const handleClick = () => {
    const canvas = ref.current;
    if (!canvas) return;
    try {
      setLightboxSrc(canvas.toDataURL());
    } catch {
      /* tainted canvas, ignore */
    }
  };

  return (
    <canvas
      ref={ref}
      onClick={handleClick}
      className={`max-w-full h-auto rounded-md border border-border bg-card cursor-zoom-in ${className || ""}`}
    />
  );
}
