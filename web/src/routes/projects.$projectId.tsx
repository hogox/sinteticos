import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useAppState } from "@/api/queries";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { colorFor, initialsOf, formatShortDate } from "@/lib/utils";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/projects/$projectId")({
  component: ProjectLayout
});

function ProjectLayout() {
  const { projectId } = Route.useParams();
  const { data: state, isLoading } = useAppState();
  const { location } = useRouterState();

  if (isLoading || !state) return <p className="text-muted-foreground">Cargando…</p>;

  const project = state.projects.find((p) => p.id === projectId);
  if (!project) {
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground">Proyecto no encontrado.</p>
        <Link to="/projects">
          <Button variant="outline" size="sm">← Volver</Button>
        </Link>
      </div>
    );
  }

  const tasks = state.tasks.filter((t) => t.project_id === project.id);
  const runs = state.runs.filter((r) => r.project_id === project.id);
  const calibrations = state.calibrations.filter((c) => c.project_id === project.id);
  const personaIds = new Set(runs.map((r) => r.persona_id));
  const color = colorFor(project.name);

  const tabs = [
    { to: "/projects/$projectId", label: "Dashboard", exact: true },
    { to: "/projects/$projectId/tasks", label: "Tasks" },
    { to: "/projects/$projectId/runs", label: "Runs" },
    { to: "/projects/$projectId/calibration", label: "Calibración" }
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div
            className="h-14 w-14 rounded-md text-white text-lg font-semibold flex items-center justify-center shrink-0"
            style={{ background: color }}
          >
            {initialsOf(project.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Proyecto</p>
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {project.description || "Sin descripción"}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge variant="outline">Creado {formatShortDate(project.created_at)}</Badge>
              <Badge variant="outline">{personaIds.size} personas</Badge>
              <Badge variant="outline">{tasks.length} tasks</Badge>
              <Badge variant="outline">{runs.length} runs</Badge>
              <Badge variant="outline">{calibrations.length} calibraciones</Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-border flex gap-1">
        {tabs.map((tab) => {
          const fullPath =
            tab.to === "/projects/$projectId"
              ? `/projects/${projectId}`
              : `/projects/${projectId}${tab.to.replace("/projects/$projectId", "")}`;
          const isActive = tab.exact ? location.pathname === fullPath : location.pathname.startsWith(fullPath);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              params={{ projectId }}
              className={cn(
                "px-4 py-2 text-sm border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <Outlet />
    </div>
  );
}
