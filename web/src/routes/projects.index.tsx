import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAppState, useDeleteProject } from "@/api/queries";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogBody
} from "@/components/ui/Dialog";
import { ProjectForm } from "@/features/projects/ProjectForm";
import type { Project } from "@/types/state";
import { colorFor, initialsOf, formatShortDate } from "@/lib/utils";

export const Route = createFileRoute("/projects/")({
  component: ProjectsPage
});

function ProjectsPage() {
  const { data: state, isLoading } = useAppState();
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);

  if (isLoading || !state) return <p className="text-muted-foreground">Cargando…</p>;

  const projects = state.projects || [];
  const runs = state.runs || [];
  const tasks = state.tasks || [];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold">Todos los proyectos</h2>
          <p className="text-sm text-muted-foreground">{projects.length} en total</p>
        </div>
        <Button onClick={() => setCreating(true)}>+ Nuevo proyecto</Button>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Aún no hay proyectos. Creá uno para correr a tus personas en flujos concretos.
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
                onEdit={() => setEditingProject(project)}
              />
            );
          })}
        </div>
      )}

      <Dialog open={creating || !!editingProject} onOpenChange={(o) => !o && (setCreating(false), setEditingProject(null))}>
        <DialogHeader>
          <DialogTitle>{editingProject ? `Editar ${editingProject.name}` : "Crear proyecto"}</DialogTitle>
          <DialogClose onClick={() => { setCreating(false); setEditingProject(null); }} />
        </DialogHeader>
        <DialogBody>
          <ProjectForm
            project={editingProject || undefined}
            onDone={() => { setCreating(false); setEditingProject(null); }}
          />
        </DialogBody>
      </Dialog>
    </div>
  );
}

interface CardProps {
  project: Project;
  personaCount: number;
  taskCount: number;
  runCount: number;
  onEdit: () => void;
}

function ProjectCard({ project, personaCount, taskCount, runCount, onEdit }: CardProps) {
  const del = useDeleteProject();
  const color = colorFor(project.name || "?");
  const initials = initialsOf(project.name);

  const onDelete = () => {
    if (confirm(`¿Eliminar el proyecto "${project.name}"? Esta acción es irreversible.`)) {
      del.mutate(project.id);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 hover:shadow-sm hover:border-primary/40 transition-all relative group">
      <Link to="/projects/$projectId" params={{ projectId: project.id }} className="block">
        <div className="flex items-start gap-3 mb-3">
          <div
            className="h-10 w-10 rounded-md text-white text-sm font-semibold flex items-center justify-center shrink-0"
            style={{ background: color }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight truncate">{project.name}</p>
            <p className="text-xs text-muted-foreground">{formatShortDate(project.created_at)}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
          {project.description || "Sin descripción"}
        </p>

        <div className="flex flex-wrap gap-1.5 mb-2">
          <Badge variant="outline">{personaCount} personas</Badge>
          <Badge variant="outline">{taskCount} tasks</Badge>
          <Badge variant="outline">{runCount} runs</Badge>
        </div>
      </Link>

      <div className="flex gap-2 mt-3">
        <Button variant="outline" size="sm" onClick={onEdit}>
          Editar
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>
          Eliminar
        </Button>
      </div>
    </div>
  );
}
