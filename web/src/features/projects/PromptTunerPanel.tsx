import { useState } from "react";
import type { Run } from "@/types/state";
import { useRunSkill } from "@/api/queries";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface ProposedEdit {
  edit_type: string;
  target: string;
  current_text?: string;
  proposed_text: string;
  rationale: string;
  evidence_runs?: string[];
  expected_outcome?: string;
}

interface TunerOutput {
  verdict?: string;
  summary?: string;
  themes_observed?: Array<{ tag: string; frequency: number; example_quotes?: string[] }>;
  proposed_edits?: ProposedEdit[];
  next_actions?: string[];
}

const verdictLabels: Record<string, string> = {
  edits_proposed: "Edits propuestos",
  insufficient_data: "Datos insuficientes",
  prompt_well_calibrated: "Prompt bien calibrado"
};

interface Props {
  projectRuns: Run[];
}

export function PromptTunerPanel({ projectRuns }: Props) {
  const runSkill = useRunSkill();
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const negativeRuns = projectRuns.filter((r) => {
    const tags = r.feedback?.tags || [];
    const rating = r.feedback?.rating || 0;
    return (rating > 0 && rating <= 2) ||
      tags.some((t) => ["robotico", "no entiende el dominio", "muy optimista", "comportamiento raro"].includes(t));
  });

  const handleAnalyze = () => {
    if (negativeRuns.length < 5) {
      alert(`Necesitás al menos 5 runs con feedback negativo. Hay ${negativeRuns.length}.`);
      return;
    }
    runSkill.mutate({
      name: "prompt-tuner",
      payload: { run_ids: negativeRuns.map((r) => r.id) }
    });
  };

  const handleCopy = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch {
      /* ignore */
    }
  };

  const result = runSkill.data;
  const output: TunerOutput | null = result?.ok ? (result.output as TunerOutput) : null;

  return (
    <article className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Mejora del prompt</p>
          <h3 className="font-semibold">Tuning desde feedback</h3>
        </div>
        <Button onClick={handleAnalyze} disabled={runSkill.isPending || negativeRuns.length < 5}>
          {runSkill.isPending ? "Analizando…" : output ? "Volver a analizar" : "Analizar runs negativos"}
        </Button>
      </div>

      {!output && !runSkill.isPending && (
        <p className="text-sm text-muted-foreground">
          Hay <strong>{negativeRuns.length}</strong> runs con feedback negativo. Si tenés al menos 5, podés correr{" "}
          <code className="text-xs bg-muted px-1 rounded">prompt-tuner</code> para que proponga edits al system prompt
          de vision.
        </p>
      )}

      {result && !result.ok && (
        <p className="text-sm text-destructive">Error: {result.error}</p>
      )}

      {output && (
        <>
          <div
            className={
              "rounded-md p-3 text-sm border-l-4 " +
              (output.verdict === "edits_proposed"
                ? "border-amber-500 bg-amber-50"
                : output.verdict === "prompt_well_calibrated"
                ? "border-emerald-500 bg-emerald-50"
                : "border-gray-400 bg-gray-50")
            }
          >
            <strong>{verdictLabels[output.verdict || ""] || output.verdict}</strong>
            <p className="mt-1">{output.summary}</p>
          </div>

          {output.themes_observed && output.themes_observed.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Temas observados</p>
              <ul className="text-sm space-y-1.5">
                {output.themes_observed.map((t, i) => (
                  <li key={i}>
                    <strong>{t.tag}</strong> · {t.frequency} apariciones
                    {t.example_quotes && t.example_quotes.length > 0 && (
                      <span className="text-muted-foreground italic block ml-3 text-xs">
                        {t.example_quotes.slice(0, 2).join(" / ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {output.proposed_edits && output.proposed_edits.length > 0 && (
            <div className="space-y-3">
              {output.proposed_edits.map((edit, i) => (
                <article key={i} className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline">{edit.edit_type}</Badge>
                    <Badge variant="outline">{edit.target}</Badge>
                    {edit.evidence_runs && (
                      <Badge variant="outline">{edit.evidence_runs.length} runs</Badge>
                    )}
                  </div>
                  {edit.current_text && (
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Texto actual</p>
                      <pre className="text-xs whitespace-pre-wrap bg-muted/40 rounded p-2">{edit.current_text}</pre>
                    </div>
                  )}
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Texto propuesto</p>
                    <pre className="text-xs whitespace-pre-wrap bg-emerald-50 border border-emerald-200 rounded p-2">
                      {edit.proposed_text}
                    </pre>
                  </div>
                  <p className="text-sm">
                    <strong>Razón:</strong> {edit.rationale}
                  </p>
                  {edit.expected_outcome && (
                    <p className="text-sm">
                      <strong>Resultado esperado:</strong> {edit.expected_outcome}
                    </p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(edit.proposed_text, i)}
                  >
                    {copiedIdx === i ? "Copiado ✓" : "Copiar texto propuesto"}
                  </Button>
                </article>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Los cambios se aplican manualmente en{" "}
            <code className="bg-muted px-1 rounded">server/vision.mjs</code> (función{" "}
            <code className="bg-muted px-1 rounded">buildSystemPrompt</code>) por un developer.
          </p>
        </>
      )}
    </article>
  );
}
