import { createFileRoute } from "@tanstack/react-router";
import { useAppState, useRunSkill, useUpdatePersona } from "@/api/queries";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { Persona } from "@/types/state";

export const Route = createFileRoute("/personas/$personaId/evolucion")({
  component: EvolucionTab
});

interface ProposedChange {
  field: keyof Persona | string;
  operation: "add" | "remove" | "update";
  value?: unknown;
  rationale: string;
  evidence?: string[];
  confidence?: "low" | "medium" | "high";
  expected_impact?: string;
}

interface EvolverOutput {
  verdict?: string;
  summary?: string;
  evidence_strength?: {
    calibrations_below_70?: number;
    runs_rated_low?: number;
    saturation?: string;
  };
  proposed_changes?: ProposedChange[];
  next_actions?: string[];
}

const verdictLabels: Record<string, string> = {
  evolve: "Cambios propuestos",
  insufficient_evidence: "Evidencia insuficiente",
  persona_well_calibrated: "Persona bien calibrada"
};

function applyChange(persona: Persona, change: ProposedChange): Persona {
  const field = change.field as keyof Persona;
  const current = persona[field];
  let nextValue: unknown = current;

  if (change.operation === "add") {
    if (Array.isArray(current)) {
      nextValue = [...current, ...(Array.isArray(change.value) ? change.value : [change.value])];
    } else if (typeof current === "string" && current) {
      nextValue = `${current} ${Array.isArray(change.value) ? change.value.join(" ") : change.value}`.trim();
    } else {
      nextValue = change.value;
    }
  } else if (change.operation === "remove") {
    if (Array.isArray(current) && Array.isArray(change.value)) {
      const removeSet = new Set(change.value as unknown[]);
      nextValue = (current as unknown[]).filter((v) => !removeSet.has(v));
    } else {
      nextValue = "";
    }
  } else if (change.operation === "update") {
    nextValue = change.value;
  }

  return { ...persona, [field]: nextValue, version: (persona.version || 1) + 1 };
}

function EvolucionTab() {
  const { personaId } = Route.useParams();
  const { data: state } = useAppState();
  const runSkill = useRunSkill();
  const updatePersona = useUpdatePersona();

  if (!state) return null;
  const persona = state.personas.find((p) => p.id === personaId);
  if (!persona) return null;

  const personaCalibs = state.calibrations.filter((c) => c.persona_id === persona.id);
  const lowCalibs = personaCalibs.filter((c) => (c.agreement || 100) < 70).length;
  const personaRuns = state.runs.filter((r) => r.persona_id === persona.id);
  const lowRuns = personaRuns.filter((r) => (r.feedback?.rating || 5) <= 2).length;

  const handleAnalyze = () => {
    if (personaRuns.length === 0) {
      alert("Esta persona aún no tiene runs para analizar.");
      return;
    }
    runSkill.mutate({
      name: "persona-evolver",
      payload: { run_ids: personaRuns.map((r) => r.id), persona_id: personaId }
    });
  };

  const handleApply = async (changes: ProposedChange[]) => {
    if (!confirm(`Aplicar ${changes.length} cambio(s) a ${persona.name}? Esto crea v${(persona.version || 1) + 1}.`)) return;
    const updated = changes.reduce<Persona>((acc, c) => applyChange(acc, c), persona);
    await updatePersona.mutateAsync({ id: personaId, payload: updated });
    runSkill.reset();
  };

  const result = runSkill.data;
  const output: EvolverOutput | null = result?.ok ? (result.output as EvolverOutput) : null;
  const changes = output?.proposed_changes || [];

  return (
    <article className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Evolución sugerida</p>
          <h3 className="text-lg font-semibold">Loop de calibración</h3>
        </div>
        <Button onClick={handleAnalyze} disabled={runSkill.isPending}>
          {runSkill.isPending ? "Analizando…" : output ? "Volver a analizar" : "Analizar y proponer cambios"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">
          {personaCalibs.length} calibraciones ({lowCalibs} con &lt; 70% agreement)
        </Badge>
        <Badge variant="outline">
          {personaRuns.length} runs ({lowRuns} con rating ≤ 2)
        </Badge>
        <Badge variant="outline">v{persona.version || 1}</Badge>
      </div>

      {!output && !runSkill.isPending && (
        <p className="text-sm text-muted-foreground">
          Ejecutá el skill <code className="text-xs">persona-evolver</code> para que analice las
          calibraciones con baja agreement y los runs con rating bajo, y proponga cambios concretos.
        </p>
      )}

      {result && !result.ok && (
        <p className="text-sm text-destructive">
          Error: {result.error || "desconocido"}
        </p>
      )}

      {output && (
        <>
          <div
            className={
              "rounded-md p-3 text-sm border-l-4 " +
              (output.verdict === "evolve"
                ? "border-amber-500 bg-amber-50"
                : output.verdict === "persona_well_calibrated"
                ? "border-emerald-500 bg-emerald-50"
                : "border-gray-400 bg-gray-50")
            }
          >
            <strong>{verdictLabels[output.verdict || ""] || output.verdict}</strong>
            <p className="mt-1">{output.summary}</p>
          </div>

          {changes.length > 0 && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => handleApply(changes)}>
                  Aplicar todos (v{(persona.version || 1) + 1})
                </Button>
              </div>
              {changes.map((change, i) => (
                <ChangeCard
                  key={i}
                  change={change}
                  persona={persona}
                  onApply={() => handleApply([change])}
                />
              ))}
            </div>
          )}

          {output.next_actions && output.next_actions.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Próximos pasos</p>
              <ul className="text-sm list-disc pl-5 space-y-1 mt-1">
                {output.next_actions.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </article>
  );
}

function ChangeCard({
  change,
  persona,
  onApply
}: {
  change: ProposedChange;
  persona: Persona;
  onApply: () => void;
}) {
  const current = persona[change.field as keyof Persona];
  const valueDisplay = (v: unknown): string => {
    if (Array.isArray(v)) return v.length ? v.join(", ") : "(vacío)";
    return String(v ?? "(vacío)");
  };

  const confidenceVariant: "success" | "warning" | "destructive" =
    change.confidence === "high" ? "success" : change.confidence === "low" ? "destructive" : "warning";

  return (
    <article className="rounded-lg border border-border p-4 space-y-2 bg-card">
      <div className="flex items-center gap-2 flex-wrap">
        <strong className="text-sm">{change.field}</strong>
        <Badge variant="outline">{change.operation}</Badge>
        <Badge variant={confidenceVariant}>{change.confidence || "medium"}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded bg-muted/40 p-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Actual</p>
          <p>{valueDisplay(current)}</p>
        </div>
        <div className="rounded bg-emerald-50 border border-emerald-200 p-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Propuesto</p>
          <p>{valueDisplay(change.value)}</p>
        </div>
      </div>
      <p className="text-sm">
        <strong>Razón:</strong> {change.rationale}
      </p>
      {change.expected_impact && (
        <p className="text-sm">
          <strong>Impacto esperado:</strong> {change.expected_impact}
        </p>
      )}
      {change.evidence && change.evidence.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Evidencia: {change.evidence.map((e) => <code key={e} className="bg-muted px-1 rounded mx-0.5">{e}</code>)}
        </p>
      )}
      <Button variant="outline" size="sm" onClick={onApply}>Aplicar este cambio</Button>
    </article>
  );
}
