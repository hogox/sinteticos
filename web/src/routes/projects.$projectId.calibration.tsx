import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createFileRoute } from "@tanstack/react-router";
import { useAppState, useCreateCalibration } from "@/api/queries";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Textarea, Select, Label } from "@/components/ui/Input";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogBody
} from "@/components/ui/Dialog";
import { formatShortDate } from "@/lib/utils";

export const Route = createFileRoute("/projects/$projectId/calibration")({
  component: CalibrationPage
});

const schema = z.object({
  persona_id: z.string().min(1),
  task_id: z.string().min(1),
  prototype_version: z.string().optional(),
  human_result: z.string().min(1, "Requerido"),
  synthetic_result: z.string().min(1, "Requerido"),
  critical_findings: z.string().optional(),
  agreement: z.number().min(0).max(100),
  notes: z.string().optional()
});

type FormValues = z.infer<typeof schema>;

function CalibrationPage() {
  const { projectId } = Route.useParams();
  const { data: state, isLoading } = useAppState();
  const [creating, setCreating] = useState(false);

  if (isLoading || !state) return <p className="text-muted-foreground">Cargando…</p>;

  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return <p className="text-muted-foreground">Proyecto no encontrado.</p>;

  const calibrations = state.calibrations.filter((c) => c.project_id === projectId);
  const personas = state.personas || [];
  const tasks = state.tasks.filter((t) => t.project_id === projectId);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold">Calibración — {project.name}</h2>
          <p className="text-sm text-muted-foreground">
            Comparación entre resultado humano y sintético.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} disabled={tasks.length === 0}>
          + Nueva calibración
        </Button>
      </div>

      {calibrations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">Sin calibraciones registradas todavía.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {calibrations.map((c) => {
            const persona = personas.find((p) => p.id === c.persona_id);
            const task = tasks.find((t) => t.id === c.task_id);
            const agreementColor = c.agreement >= 80 ? "success" : c.agreement >= 60 ? "warning" : "destructive";
            return (
              <article key={c.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{persona?.name || "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {task?.prompt?.slice(0, 60) || "—"} · {formatShortDate(c.created_at)}
                    </p>
                  </div>
                  <Badge variant={agreementColor}>{c.agreement}% agreement</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="font-medium text-xs uppercase text-muted-foreground">Humano</p>
                    <p>{c.human_result}</p>
                  </div>
                  <div>
                    <p className="font-medium text-xs uppercase text-muted-foreground">Sintético</p>
                    <p>{c.synthetic_result}</p>
                  </div>
                </div>
                {c.critical_findings && (
                  <p className="text-sm text-muted-foreground">
                    <strong>Findings críticos:</strong> {c.critical_findings}
                  </p>
                )}
                {c.notes && <p className="text-xs text-muted-foreground italic">{c.notes}</p>}
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogHeader>
          <DialogTitle>Nueva calibración</DialogTitle>
          <DialogClose onClick={() => setCreating(false)} />
        </DialogHeader>
        <DialogBody>
          <CalibrationForm
            projectId={projectId}
            personas={personas}
            tasks={tasks}
            onDone={() => setCreating(false)}
          />
        </DialogBody>
      </Dialog>
    </div>
  );
}

interface FormProps {
  projectId: string;
  personas: { id: string; name: string }[];
  tasks: { id: string; prompt: string }[];
  onDone: () => void;
}

function CalibrationForm({ projectId, personas, tasks, onDone }: FormProps) {
  const create = useCreateCalibration();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      persona_id: personas[0]?.id || "",
      task_id: tasks[0]?.id || "",
      agreement: 70
    }
  });

  const onSubmit = handleSubmit(async (values) => {
    await create.mutateAsync({ project_id: projectId, ...values });
    onDone();
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Label>
          Persona
          <Select {...register("persona_id")}>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </Label>
        <Label>
          Task
          <Select {...register("task_id")}>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>{t.prompt.slice(0, 60)}</option>
            ))}
          </Select>
        </Label>
      </div>

      <Label>
        Versión del prototipo
        <Input {...register("prototype_version")} placeholder="v1.0" />
      </Label>

      <Label>
        Resultado humano (lo que pasó en testing real)
        <Textarea rows={3} {...register("human_result")} />
        {errors.human_result && <span className="text-xs text-destructive">{errors.human_result.message}</span>}
      </Label>

      <Label>
        Resultado sintético (lo que vimos en runs)
        <Textarea rows={3} {...register("synthetic_result")} />
        {errors.synthetic_result && <span className="text-xs text-destructive">{errors.synthetic_result.message}</span>}
      </Label>

      <Label>
        Findings críticos (opcional)
        <Textarea rows={2} {...register("critical_findings")} />
      </Label>

      <Label>
        Agreement (0-100)
        <Input type="number" min={0} max={100} {...register("agreement", { valueAsNumber: true })} />
      </Label>

      <Label>
        Notas
        <Textarea rows={2} {...register("notes")} />
      </Label>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>
        <Button type="submit" disabled={isSubmitting}>Guardar</Button>
      </div>
    </form>
  );
}
