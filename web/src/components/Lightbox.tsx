import { useEffect } from "react";
import { useUI } from "@/stores/ui";

export function Lightbox() {
  const lightboxSrc = useUI((s) => s.lightboxSrc);
  const setLightboxSrc = useUI((s) => s.setLightboxSrc);

  useEffect(() => {
    if (!lightboxSrc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxSrc(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightboxSrc, setLightboxSrc]);

  if (!lightboxSrc) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4 cursor-zoom-out"
      onClick={() => setLightboxSrc(null)}
    >
      <button
        type="button"
        onClick={() => setLightboxSrc(null)}
        className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl leading-none"
        aria-label="Cerrar"
      >
        ×
      </button>
      <img
        src={lightboxSrc}
        alt=""
        className="max-w-[92vw] max-h-[92vh] object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
