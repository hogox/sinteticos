import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useAppState } from "@/api/queries";
import { useUI } from "@/stores/ui";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { colorFor, initialsOf, labelDigitalLevel } from "@/lib/utils";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/personas/$personaId")({
  component: PersonaDetailLayout
});

function PersonaDetailLayout() {
  const { personaId } = Route.useParams();
  const { data: state, isLoading } = useAppState();
  const { location } = useRouterState();
  const openChatDrawer = useUI((s) => s.openChatDrawer);

  if (isLoading || !state) return <p className="text-muted-foreground">Cargando…</p>;

  const persona = state.personas.find((p) => p.id === personaId);
  if (!persona) {
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground">Persona no encontrada.</p>
        <Link to="/personas">
          <Button variant="outline" size="sm">← Volver</Button>
        </Link>
      </div>
    );
  }

  const runs = state.runs.filter((r) => r.persona_id === persona.id);
  const tasks = state.tasks.filter((t) => t.persona_id === persona.id);
  const calibrations = state.calibrations.filter((c) => c.persona_id === persona.id);
  const color = colorFor(persona.name || "?");

  const tabs = [
    { to: "/personas/$personaId", label: "Perfil", exact: true },
    { to: "/personas/$personaId/tareas", label: "Tareas" },
    { to: "/personas/$personaId/actividad", label: "Actividad" },
    { to: "/personas/$personaId/evolucion", label: "Evolución" }
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div
            className="h-16 w-16 rounded-full text-white text-xl font-semibold flex items-center justify-center shrink-0"
            style={{ background: color }}
          >
            {initialsOf(persona.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Ficha de persona</p>
                <h1 className="text-2xl font-semibold">{persona.name}</h1>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => openChatDrawer(persona.id, "chat")}>
                  Conversar
                </Button>
                <Button variant="outline" size="sm" onClick={() => openChatDrawer(persona.id, "hypothesis")}>
                  Validar hipótesis
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {persona.description || persona.usage_context || "Sin descripción"}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge variant={persona.status === "active" ? "success" : "secondary"}>{persona.status}</Badge>
              <Badge variant="outline">{persona.segment || "Sin segmento"}</Badge>
              <Badge variant="outline">{persona.role || "Sin rol"}</Badge>
              <Badge variant="outline">{labelDigitalLevel(persona.digital_level)}</Badge>
              <Badge variant="outline">v{persona.version}</Badge>
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
            tab.exact ? `/personas/${personaId}` : `/personas/${personaId}${tab.to.replace("/personas/$personaId", "")}`;
          const isActive = tab.exact ? location.pathname === fullPath : location.pathname.startsWith(fullPath);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              params={{ personaId }}
              className={cn(
                "px-4 py-2 text-sm border-b-2 -mb-px transition-colors",
                isActive ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
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
