import { createFileRoute } from "@tanstack/react-router";
import { useAppState } from "@/api/queries";
import { QualityMetrics } from "@/features/projects/QualityMetrics";
import { PromptTunerPanel } from "@/features/projects/PromptTunerPanel";

export const Route = createFileRoute("/projects/$projectId/")({
  component: ProjectDashboard
});

function ProjectDashboard() {
  const { projectId } = Route.useParams();
  const { data: state } = useAppState();
  if (!state) return null;

  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return null;
  const ctx = project.context || {};

  const projectRuns = state.runs.filter((r) => r.project_id === projectId);
  const completedRate = projectRuns.length
    ? Math.round((projectRuns.filter((r) => r.completion_status === "completed").length / projectRuns.length) * 100)
    : 0;
  const abandonRate = projectRuns.length
    ? Math.round((projectRuns.filter((r) => r.completion_status === "abandoned").length / projectRuns.length) * 100)
    : 0;
  const totalSteps = projectRuns.reduce((sum, r) => sum + (r.step_log?.length || 0), 0);
  const avgSteps = projectRuns.length ? Math.round(totalSteps / projectRuns.length) : 0;

  const stats = [
    { label: "Task success rate", value: `${completedRate}%`, hint: "Runs completados" },
    { label: "Abandonment rate", value: `${abandonRate}%`, hint: "Runs abandonados" },
    { label: "Runs", value: String(projectRuns.length), hint: "Total" },
    { label: "Avg pasos / run", value: String(avgSteps), hint: "Secuencia observada" }
  ];

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2 font-medium">
          Operación
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((s) => (
            <article key={s.label} className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-semibold mt-1">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.hint}</p>
            </article>
          ))}
        </div>
      </section>

      <QualityMetrics state={state} projectId={projectId} />

      {(ctx.domain_brief ||
        ctx.audience_constraints ||
        ctx.prior_findings?.length ||
        ctx.do_not?.length) && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Contexto del dominio</p>
          {ctx.domain_brief && (
            <div>
              <p className="text-sm font-medium">Dominio</p>
              <p className="text-sm text-muted-foreground">{ctx.domain_brief}</p>
            </div>
          )}
          {ctx.audience_constraints && (
            <div>
              <p className="text-sm font-medium">Audiencia</p>
              <p className="text-sm text-muted-foreground">{ctx.audience_constraints}</p>
            </div>
          )}
          {ctx.prior_findings && ctx.prior_findings.length > 0 && (
            <div>
              <p className="text-sm font-medium">Hallazgos previos</p>
              <ul className="text-sm text-muted-foreground list-disc pl-5">
                {ctx.prior_findings.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}
          {ctx.do_not && ctx.do_not.length > 0 && (
            <div>
              <p className="text-sm font-medium">No asumir</p>
              <ul className="text-sm text-muted-foreground list-disc pl-5">
                {ctx.do_not.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      <PromptTunerPanel projectRuns={projectRuns} />
    </div>
  );
}
