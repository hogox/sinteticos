import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAppState, useDeleteTask, useExecuteRun } from "@/api/queries";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogBody
} from "@/components/ui/Dialog";
import { TaskForm } from "@/features/tasks/TaskForm";
import type { Task } from "@/types/state";

export const Route = createFileRoute("/projects/$projectId/tasks")({
  component: TasksPage
});

function labelTaskType(type: string) {
  if (type === "idea") return "Exploración de idea";
  if (type === "five_second_test") return "Prueba de 5 segundos";
  return "Recorrido guiado";
}

function TasksPage() {
  const { projectId } = Route.useParams();
  const { data: state, isLoading } = useAppState();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);

  if (isLoading || !state) return <p className="text-muted-foreground">Cargando…</p>;

  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return <p className="text-muted-foreground">Proyecto no encontrado.</p>;

  const tasks = (state.tasks || []).filter((t) => t.project_id === projectId);
  const personas = state.personas || [];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold">Tareas — {project.name}</h2>
          <p className="text-sm text-muted-foreground">{tasks.length} tarea{tasks.length === 1 ? "" : "s"}</p>
        </div>
        <Button onClick={() => setCreating(true)} disabled={personas.length === 0}>
          + Nueva tarea
        </Button>
      </div>

      {personas.length === 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded">
          Necesitás al menos una persona para crear tareas.
        </p>
      )}

      {tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Aún no hay tareas en este proyecto.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {tasks.map((task) => {
            const persona = personas.find((p) => p.id === task.persona_id);
            return (
              <TaskCard
                key={task.id}
                task={task}
                personaName={persona?.name || "Sin persona"}
                projectId={projectId}
                onEdit={() => setEditingTask(task)}
              />
            );
          })}
        </div>
      )}

      <Dialog open={creating || !!editingTask} onOpenChange={(o) => !o && (setCreating(false), setEditingTask(null))}>
        <DialogHeader>
          <DialogTitle>{editingTask ? "Editar tarea" : "Crear tarea"}</DialogTitle>
          <DialogClose onClick={() => { setCreating(false); setEditingTask(null); }} />
        </DialogHeader>
        <DialogBody>
          <TaskForm
            task={editingTask || undefined}
            projects={state.projects}
            personas={personas}
            defaultProjectId={projectId}
            onDone={() => { setCreating(false); setEditingTask(null); }}
          />
        </DialogBody>
      </Dialog>
    </div>
  );
}

interface CardProps {
  task: Task;
  personaName: string;
  projectId: string;
  onEdit: () => void;
}

function TaskCard({ task, personaName, projectId, onEdit }: CardProps) {
  const del = useDeleteTask();
  const execute = useExecuteRun();
  const navigate = useNavigate();
  const [runCount, setRunCount] = useState(1);

  const onDelete = () => {
    if (confirm("¿Eliminar esta tarea?")) del.mutate(task.id);
  };

  const onRun = async () => {
    await execute.mutateAsync({ taskId: task.id, runCount });
    navigate({ to: "/projects/$projectId/runs", params: { projectId } });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{personaName}</p>
          <p className="font-medium leading-tight">{task.prompt}</p>
        </div>
        <Badge variant="outline">{labelTaskType(task.type)}</Badge>
      </div>
      {task.url && (
        <p className="text-xs text-muted-foreground truncate mb-2" title={task.url}>
          {task.url}
        </p>
      )}
      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
        {task.success_criteria || "Sin criterio de éxito"}
      </p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        <Badge variant="outline">
          {task.max_steps ? `Hasta ${task.max_steps} pasos` : "Sin límite"}
        </Badge>
        {task.mcp_enabled && <Badge variant="outline">MCP</Badge>}
        {task.predictive_attention_enabled && <Badge variant="outline">Atención estimada</Badge>}
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={onRun}
          disabled={execute.isPending}
          className="flex-shrink-0"
        >
          {execute.isPending ? "Ejecutando…" : "▶ Ejecutar"}
        </Button>
        <select
          value={runCount}
          onChange={(e) => setRunCount(Number(e.target.value))}
          disabled={execute.isPending}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          {[1, 2, 3, 5, 8].map((n) => (
            <option key={n} value={n}>{n} {n === 1 ? "run" : "runs"}</option>
          ))}
        </select>
        <div className="flex gap-1 ml-auto">
          <Button variant="outline" size="sm" onClick={onEdit}>
            Editar
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            Eliminar
          </Button>
        </div>
      </div>
      {execute.isError && (
        <p className="text-xs text-destructive mt-2">
          {(execute.error as Error).message}
        </p>
      )}
    </div>
  );
}
