import type { Run, StepLogEntry, Finding } from "@/types/state";
import { Badge } from "@/components/ui/Badge";
import { useUI } from "@/stores/ui";
import { RunCanvas } from "./RunCanvas";
import { RunFeedback } from "./RunFeedback";
import { SkillsSection } from "./SkillsSection";
import { cn } from "@/lib/cn";

const tabs = ["observed", "inferred", "predictive"] as const;
type Tab = (typeof tabs)[number];

const tabLabels: Record<Tab, string> = {
  observed: "Observado",
  inferred: "Inferido",
  predictive: "Predictivo"
};

const tabHints: Record<Tab, string> = {
  observed: "Qué pasó: pasos, clicks, transiciones reales del run.",
  inferred: "Qué interpretamos: findings y resumen narrativo.",
  predictive: "Qué estimamos: atención visual sin evidencia directa."
};

export function RunDetail({ run, projectRuns }: { run: Run; projectRuns: Run[] }) {
  const view = useUI((s) => s.runDetailView);
  const setView = useUI((s) => s.setRunDetailView);

  return (
    <div className="space-y-4">
      <div className="border-b border-border flex gap-1">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setView(t)}
            className={cn(
              "px-4 py-2 text-sm border-b-2 -mb-px transition-colors",
              view === t
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tabLabels[t]}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground -mt-2">{tabHints[view]}</p>

      {view === "observed" && <ObservedTab run={run} />}
      {view === "inferred" && <InferredTab run={run} />}
      {view === "predictive" && <PredictiveTab run={run} />}

      <RunFeedback run={run} />
      <SkillsSection run={run} projectRuns={projectRuns} />
    </div>
  );
}

function ObservedTab({ run }: { run: Run }) {
  const setLightbox = useUI((s) => s.setLightboxSrc);
  const observedHeat = run.observed_heatmaps?.[0];
  const observedScan = run.observed_scanpaths?.[0];
  const firstScreenshot = run.screenshots?.[0]?.src;

  return (
    <div className="space-y-4">
      {(observedHeat || observedScan) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {observedHeat && (
            <RunCanvas
              imageSrc={firstScreenshot}
              points={observedHeat.points}
              mode="heatmap"
              title="Heatmap"
            />
          )}
          {observedScan && (
            <RunCanvas
              imageSrc={firstScreenshot}
              points={observedScan.points}
              mode="scanpath"
              title="Scanpath"
            />
          )}
        </div>
      )}

      {run.screenshots?.length > 0 && (
        <section>
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Pantallas</h4>
          <div className="space-y-3">
            {run.screenshots.map((shot, i) => (
              <ScreenStep key={i} run={run} screenshot={shot} onZoom={() => setLightbox(shot.src)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ScreenStep({
  run,
  screenshot,
  onZoom
}: {
  run: Run;
  screenshot: { src: string; screen: string; step: number };
  onZoom: () => void;
}) {
  const step = run.step_log.find((s) => s.step === screenshot.step);
  return (
    <figure className="rounded-lg border border-border bg-card overflow-hidden">
      <img
        src={screenshot.src}
        alt={screenshot.screen}
        className="w-full max-w-md mx-auto cursor-zoom-in"
        onClick={onZoom}
      />
      <figcaption className="px-4 py-3 text-sm space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline">Paso {screenshot.step}</Badge>
          <strong>{screenshot.screen}</strong>
          {step && <Badge variant="outline">{step.action}</Badge>}
          {step && <Badge variant="outline">{step.certainty}% certeza</Badge>}
          {step?.emotion && step.emotion !== "neutral" && <Badge variant="warning">{step.emotion}</Badge>}
        </div>
        {step?.reason && <p className="text-muted-foreground text-xs">{step.reason}</p>}
      </figcaption>
    </figure>
  );
}

function InferredTab({ run }: { run: Run }) {
  const findings: Finding[] = run.report_details?.prioritized_findings || [];
  const firstImpression = run.report_details?.first_impression as
    | {
        firstImpression?: string;
        understoodPurpose?: string;
        taskRelevance?: number;
      }
    | undefined;

  return (
    <div className="space-y-4">
      {firstImpression && (
        <article className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h4 className="font-semibold mb-2">Prueba de 5 segundos · Primera impresión</h4>
          {firstImpression.firstImpression && (
            <p className="text-sm whitespace-pre-wrap">{firstImpression.firstImpression}</p>
          )}
          {firstImpression.understoodPurpose && (
            <p className="text-sm mt-2">
              <strong>Entendí que:</strong> {firstImpression.understoodPurpose}
            </p>
          )}
          {typeof firstImpression.taskRelevance === "number" && (
            <p className="text-xs text-muted-foreground mt-2">
              Relevancia para la tarea: {firstImpression.taskRelevance}%
            </p>
          )}
        </article>
      )}

      <article className="rounded-lg border border-border bg-card p-5">
        <h4 className="font-semibold mb-2">Resumen del run</h4>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
          {run.report_summary || "Sin resumen."}
        </p>
      </article>

      <article className="rounded-lg border border-border bg-card p-5">
        <h4 className="font-semibold mb-2">Voz de la persona</h4>
        <p className="text-sm whitespace-pre-wrap">{run.persona_response || "—"}</p>
      </article>

      <section>
        <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          Findings priorizados
        </h4>
        {findings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin findings.</p>
        ) : (
          <div className="space-y-2">
            {findings.map((f, i) => (
              <article key={i} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <strong className="text-sm">{f.label}</strong>
                  <Badge
                    variant={
                      f.severity === "critical" || f.severity === "high"
                        ? "destructive"
                        : f.severity === "medium"
                        ? "warning"
                        : "secondary"
                    }
                  >
                    {f.severity}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{f.detail}</p>
                {f.framework_citation && (
                  <p className="text-xs text-muted-foreground mt-1.5 italic">
                    Framework: {f.framework_citation}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Step log</h4>
        <StepLogTable steps={run.step_log} />
      </section>
    </div>
  );
}

function StepLogTable({ steps }: { steps: StepLogEntry[] }) {
  if (!steps?.length) return <p className="text-sm text-muted-foreground">Sin pasos registrados.</p>;
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2">#</th>
            <th className="text-left px-3 py-2">Pantalla</th>
            <th className="text-left px-3 py-2">Acción</th>
            <th className="text-left px-3 py-2">Razón</th>
            <th className="text-right px-3 py-2">Certeza</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s) => (
            <tr key={s.step} className="border-t border-border align-top">
              <td className="px-3 py-2 font-medium">{s.step}</td>
              <td className="px-3 py-2">{s.screen}</td>
              <td className="px-3 py-2">
                <Badge variant="outline">{s.action}</Badge>
                {s.emotion && s.emotion !== "neutral" && (
                  <Badge variant="warning" className="ml-1">
                    {s.emotion}
                  </Badge>
                )}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{s.reason}</td>
              <td className="px-3 py-2 text-right">{s.certainty}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PredictiveTab({ run }: { run: Run }) {
  const predictive = run.predicted_attention_maps?.[0];
  const firstScreenshot = run.screenshots?.[0]?.src;
  return (
    <div className="space-y-4">
      {!predictive ? (
        <p className="text-sm text-muted-foreground">Sin atención predictiva activada para este run.</p>
      ) : (
        <>
          <RunCanvas
            imageSrc={firstScreenshot}
            points={predictive.points}
            mode="heatmap"
            predictive
            title="Atención predictiva"
          />
          {predictive.notes && predictive.notes.length > 0 && (
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
              {predictive.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
