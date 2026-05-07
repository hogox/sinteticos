import type { AppState } from "@/types/state";

interface Props {
  state: AppState;
  projectId: string;
}

interface Metric {
  label: string;
  value: string;
  hint: string;
}

function compute(state: AppState, projectId: string): Metric[] {
  const projectRuns = state.runs.filter((r) => r.project_id === projectId);
  const ratedRuns = projectRuns.filter((r) => r.feedback?.rating);
  const realismCount = projectRuns.filter((r) => (r.feedback?.rating || 0) >= 4).length;
  const realismRate = ratedRuns.length ? Math.round((realismCount / ratedRuns.length) * 100) : 0;

  const tagCounts: Record<string, number> = {};
  ratedRuns.forEach((r) => {
    (r.feedback?.tags || []).forEach((t) => {
      if (t === "muy realista" || t === "perfecto") return;
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    });
  });
  const topTagEntry = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0];
  const topTag = topTagEntry?.[0] || "—";
  const topTagCount = topTagEntry?.[1] || 0;

  const projectRunIds = new Set(projectRuns.map((r) => r.id));
  const projectAnalyses = (state.run_analyses || []).filter((a) =>
    a.run_ids?.some((id) => projectRunIds.has(id))
  );
  const ratedAnalyses = projectAnalyses.filter(
    (a) => a.feedback?.helpful !== undefined && a.feedback?.helpful !== null
  );
  const helpfulCount = ratedAnalyses.filter((a) => a.feedback?.helpful).length;
  const skillHelpfulRate = ratedAnalyses.length ? Math.round((helpfulCount / ratedAnalyses.length) * 100) : 0;
  const surpriseCount = projectAnalyses.filter((a) => a.feedback?.surprised_me).length;

  const projectCalibrations = state.calibrations.filter((c) => c.project_id === projectId);
  const calibOk = projectCalibrations.filter((c) => (c.agreement || 0) >= 80).length;
  const calibOkRate = projectCalibrations.length ? Math.round((calibOk / projectCalibrations.length) * 100) : 0;

  const personaIds = new Set(projectRuns.map((r) => r.persona_id));
  let personasNeedingEvolve = 0;
  personaIds.forEach((pid) => {
    const lowCalibs = projectCalibrations.filter((c) => c.persona_id === pid && (c.agreement || 100) < 70).length;
    const lowRuns = projectRuns.filter((r) => r.persona_id === pid && (r.feedback?.rating || 5) <= 2).length;
    if (lowCalibs >= 2 || lowRuns >= 3) personasNeedingEvolve += 1;
  });

  return [
    { label: "Realismo percibido", value: `${realismRate}%`, hint: `${ratedRuns.length} runs ≥ 4★` },
    { label: "Top queja en runs", value: topTag, hint: `${topTagCount} apariciones` },
    { label: "Skills útiles", value: `${skillHelpfulRate}%`, hint: `${ratedAnalyses.length} análisis votados` },
    { label: "Calibración alta", value: `${calibOkRate}%`, hint: "Agreement ≥ 80%" },
    { label: "Análisis sorpresivos", value: String(surpriseCount), hint: "Detectaron algo no obvio" },
    { label: "Personas a evolucionar", value: String(personasNeedingEvolve), hint: "Con feedback recurrente bajo" }
  ];
}

export function QualityMetrics({ state, projectId }: Props) {
  const metrics = compute(state, projectId);
  return (
    <section>
      <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2 font-medium">
        Calidad sintética y feedback
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {metrics.map((m) => (
          <article key={m.label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{m.label}</p>
            <p className="text-2xl font-semibold mt-1 truncate" title={m.value}>{m.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{m.hint}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
