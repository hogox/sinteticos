import { useState } from "react";
import type { Run } from "@/types/state";
import { useRateRun } from "@/api/queries";
import { cn } from "@/lib/cn";

const TAGS = [
  "robotico",
  "no entiende el dominio",
  "muy optimista",
  "comportamiento raro",
  "muy realista",
  "perfecto"
];

export function RunFeedback({ run }: { run: Run }) {
  const rate = useRateRun();
  const fb = run.feedback;
  const [comment, setComment] = useState(fb?.comment || "");

  const submit = (partial: { rating?: number; tags?: string[]; comment?: string }) => {
    rate.mutate({
      id: run.id,
      feedback: {
        rating: partial.rating ?? fb?.rating ?? null,
        tags: partial.tags ?? fb?.tags ?? [],
        comment: partial.comment ?? comment
      }
    });
  };

  const toggleTag = (tag: string) => {
    const current = fb?.tags || [];
    submit({ tags: current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag] });
  };

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <h4 className="text-sm font-medium">¿Qué tan realista te pareció este run?</h4>

      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => submit({ rating: n })}
            className={cn(
              "text-2xl leading-none transition-colors",
              (fb?.rating || 0) >= n ? "text-amber-400" : "text-gray-300 hover:text-amber-300"
            )}
            aria-label={`${n} estrellas`}
          >
            ★
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => toggleTag(tag)}
            className={cn(
              "px-2.5 py-0.5 rounded-full text-xs border transition-colors",
              fb?.tags.includes(tag)
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border hover:bg-accent"
            )}
          >
            {tag}
          </button>
        ))}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onBlur={() => comment !== (fb?.comment || "") && submit({ comment })}
        placeholder="Comentario libre (opcional)"
        rows={2}
        className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm"
      />

      <p className="text-xs text-muted-foreground">
        {fb?.rated_at
          ? `Última calificación: ${new Date(fb.rated_at).toLocaleString()}`
          : "Sin calificar todavía"}
      </p>
    </div>
  );
}
