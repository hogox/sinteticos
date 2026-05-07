import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAppState } from "@/api/queries";
import { Badge } from "@/components/ui/Badge";
import { useUI } from "@/stores/ui";
import { RunDetail } from "@/features/runs/RunDetail";
import { formatShortDate } from "@/lib/utils";
import type { Run, CompletionStatus } from "@/types/state";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/projects/$projectId/runs")({
  component: RunsPage
});

function statusVariant(status: CompletionStatus): "success" | "destructive" | "warning" | "secondary" {
  if (status === "completed") return "success";
  if (status === "abandoned" || status === "error") return "destructive";
  if (status === "uncertain") return "warning";
  return "secondary";
}

function RunsPage() {
  const { projectId } = Route.useParams();
  const { data: state } = useAppState();
  const selectedRunId = useUI((s) => s.selectedRunId);
  const setSelectedRunId = useUI((s) => s.setSelectedRunId);

  const runs = (state?.runs || [])
    .filter((r) => r.project_id === projectId)
    .slice()
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  useEffect(() => {
    if (runs.length > 0 && !selectedRunId) {
      setSelectedRunId(runs[0].id);
    }
  }, [runs, selectedRunId, setSelectedRunId]);

  if (!state) return null;

  if (runs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center space-y-2">
        <p className="text-sm text-muted-foreground">Sin runs en este proyecto.</p>
        <Link
          to="/projects/$projectId/tasks"
          params={{ projectId }}
          className="text-sm text-primary hover:underline"
        >
          Creá una tarea para empezar →
        </Link>
      </div>
    );
  }

  const selectedRun = runs.find((r) => r.id === selectedRunId) || runs[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
      <aside className="space-y-2 lg:max-h-[calc(100vh-260px)] lg:overflow-y-auto lg:pr-1">
        <h3 className="text-sm font-medium text-muted-foreground">
          Historial · {runs.length} run{runs.length === 1 ? "" : "s"}
        </h3>
        {runs.map((run) => (
          <RunListItem
            key={run.id}
            run={run}
            personaName={state.personas.find((p) => p.id === run.persona_id)?.name || "Persona"}
            isSelected={run.id === selectedRun.id}
            onClick={() => setSelectedRunId(run.id)}
          />
        ))}
      </aside>
      <section>
        <RunDetail run={selectedRun} projectRuns={runs} />
      </section>
    </div>
  );
}

interface ListItemProps {
  run: Run;
  personaName: string;
  isSelected: boolean;
  onClick: () => void;
}

function RunListItem({ run, personaName, isSelected, onClick }: ListItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border p-3 transition-colors",
        isSelected
          ? "bg-primary/5 border-primary/40"
          : "bg-card border-border hover:border-primary/30"
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-sm font-medium leading-tight">{personaName}</p>
        <Badge variant={statusVariant(run.completion_status)}>{run.completion_status}</Badge>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2">{run.report_summary || "—"}</p>
      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
        <span>{formatShortDate(run.started_at)}</span>
        <span>·</span>
        <span>{run.step_log.length} pasos</span>
        {run.feedback?.rating && (
          <>
            <span>·</span>
            <span className="text-amber-500">{"★".repeat(run.feedback.rating)}</span>
          </>
        )}
      </div>
    </button>
  );
}
