import { createFileRoute, Link } from "@tanstack/react-router";
import { useAppState } from "@/api/queries";
import { Badge } from "@/components/ui/Badge";

export const Route = createFileRoute("/personas/$personaId/tareas")({
  component: TareasTab
});

function labelTaskType(type: string) {
  if (type === "idea") return "Exploración de idea";
  if (type === "five_second_test") return "Prueba de 5 segundos";
  return "Recorrido guiado";
}

function TareasTab() {
  const { personaId } = Route.useParams();
  const { data: state } = useAppState();
  if (!state) return null;

  const tasks = state.tasks.filter((t) => t.persona_id === personaId);
  const projects = state.projects;

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">Sin tareas asignadas a esta persona.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {tasks.map((task) => {
        const project = projects.find((p) => p.id === task.project_id);
        return (
          <Link
            key={task.id}
            to="/projects/$projectId/tasks"
            params={{ projectId: task.project_id }}
            className="rounded-lg border border-border bg-card p-4 hover:shadow-sm hover:border-primary/40 transition-all"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  {project?.name || "Proyecto"}
                </p>
                <p className="font-medium leading-tight">{task.prompt}</p>
              </div>
              <Badge variant="outline">{labelTaskType(task.type)}</Badge>
            </div>
            {task.url && (
              <p className="text-xs text-muted-foreground truncate" title={task.url}>{task.url}</p>
            )}
          </Link>
        );
      })}
    </div>
  );
}
