import { createFileRoute, Link } from "@tanstack/react-router";
import { useAppState } from "@/api/queries";
import { useUI } from "@/stores/ui";
import { Badge } from "@/components/ui/Badge";
import { formatShortDate } from "@/lib/utils";
import type { CompletionStatus } from "@/types/state";

export const Route = createFileRoute("/personas/$personaId/actividad")({
  component: ActividadTab
});

function statusVariant(status: CompletionStatus): "success" | "destructive" | "warning" | "secondary" {
  if (status === "completed") return "success";
  if (status === "abandoned" || status === "error") return "destructive";
  if (status === "uncertain") return "warning";
  return "secondary";
}

function ActividadTab() {
  const { personaId } = Route.useParams();
  const { data: state } = useAppState();
  const setSelectedRunId = useUI((s) => s.setSelectedRunId);
  if (!state) return null;

  const runs = state.runs
    .filter((r) => r.persona_id === personaId)
    .slice()
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  if (runs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">Sin runs registrados para esta persona.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <Link
          key={run.id}
          to="/projects/$projectId/runs"
          params={{ projectId: run.project_id || "" }}
          onClick={() => setSelectedRunId(run.id)}
          className="block rounded-lg border border-border bg-card p-4 hover:shadow-sm hover:border-primary/40 transition-all"
        >
          <div className="flex items-start justify-between gap-3 mb-1">
            <p className="font-medium text-sm">{run.report_summary || "Run"}</p>
            <Badge variant={statusVariant(run.completion_status)}>{run.completion_status}</Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{formatShortDate(run.started_at)}</span>
            <span>·</span>
            <span>{run.step_log.length} pasos</span>
            <span>·</span>
            <span>{run.engine}</span>
            {run.feedback?.rating && (
              <>
                <span>·</span>
                <span>{"★".repeat(run.feedback.rating)}</span>
              </>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
