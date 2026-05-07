import { createFileRoute } from "@tanstack/react-router";
import { useAppState } from "@/api/queries";
import { PersonaCard } from "@/features/home/PersonaCard";
import { ProjectCard } from "@/features/home/ProjectCard";

export const Route = createFileRoute("/")({
  component: HomePage
});

function HomePage() {
  const { data: state, isLoading, error } = useAppState();

  if (isLoading) return <p className="text-muted-foreground">Cargando estado…</p>;
  if (error) return <p className="text-destructive">Error: {(error as Error).message}</p>;
  if (!state) return null;

  const personas = (state.personas || []).filter((p) => p.status !== "archived");
  const conversations = state.persona_conversations || [];
  const runs = state.runs || [];
  const tasks = state.tasks || [];
  const projects = state.projects || [];

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">Personas</h2>
            <p className="text-sm text-muted-foreground">
              {personas.length} arquetipo{personas.length === 1 ? "" : "s"} activo{personas.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        {personas.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Aún no creaste personas. Creá una para empezar a explorar hipótesis y proyectos.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {personas.map((persona) => {
              const runCount = runs.filter((r) => r.persona_id === persona.id).length;
              const chatCount = conversations.filter((c) => c.persona_id === persona.id).length;
              return (
                <PersonaCard
                  key={persona.id}
                  persona={persona}
                  runCount={runCount}
                  chatCount={chatCount}
                />
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">Projects</h2>
            <p className="text-sm text-muted-foreground">
              {projects.length} proyecto{projects.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        {projects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Todavía no hay proyectos. Creá uno para correr a tus personas en flujos concretos.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {projects.map((project) => {
              const projectRuns = runs.filter((r) => r.project_id === project.id);
              const projectTasks = tasks.filter((t) => t.project_id === project.id);
              const personaIdsInRuns = new Set(projectRuns.map((r) => r.persona_id));
              return (
                <ProjectCard
                  key={project.id}
                  project={project}
                  personaCount={personaIdsInRuns.size}
                  taskCount={projectTasks.length}
                  runCount={projectRuns.length}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
