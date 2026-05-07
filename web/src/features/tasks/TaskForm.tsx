import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Task, Persona, Project } from "@/types/state";
import { Input, Textarea, Select, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useCreateTask, useUpdateTask } from "@/api/queries";

const schema = z.object({
  project_id: z.string().min(1, "Seleccioná un proyecto"),
  persona_id: z.string().min(1, "Seleccioná una persona"),
  type: z.enum(["navigation", "five_second_test", "idea"]),
  prompt: z.string().min(1, "Requerido"),
  url: z.string().optional(),
  success_criteria: z.string().optional(),
  unlimited_steps: z.boolean(),
  max_steps: z.number().min(2).max(12).optional(),
  mcp_enabled: z.boolean(),
  predictive_attention_enabled: z.boolean(),
  artifacts_enabled: z.boolean()
});

type FormValues = z.infer<typeof schema>;

interface Props {
  task?: Task;
  projects: Project[];
  personas: Persona[];
  defaultProjectId?: string;
  onDone: () => void;
}

export function TaskForm({ task, projects, personas, defaultProjectId, onDone }: Props) {
  const create = useCreateTask();
  const update = useUpdateTask();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      project_id: task?.project_id || defaultProjectId || projects[0]?.id || "",
      persona_id: task?.persona_id || personas[0]?.id || "",
      type: (task?.type as FormValues["type"]) || "navigation",
      prompt: task?.prompt || "",
      url: task?.url || "",
      success_criteria: task?.success_criteria || "",
      unlimited_steps: task ? task.max_steps == null : false,
      max_steps: task?.max_steps ?? 5,
      mcp_enabled: task?.mcp_enabled ?? false,
      predictive_attention_enabled: task?.predictive_attention_enabled ?? false,
      artifacts_enabled: task?.artifacts_enabled ?? true
    }
  });

  const unlimited = watch("unlimited_steps");

  const onSubmit = handleSubmit(async (values) => {
    const payload = {
      project_id: values.project_id,
      persona_id: values.persona_id,
      type: values.type,
      prompt: values.prompt,
      url: values.url,
      success_criteria: values.success_criteria,
      max_steps: values.unlimited_steps ? null : Number(values.max_steps) || 5,
      mcp_enabled: values.mcp_enabled,
      predictive_attention_enabled: values.predictive_attention_enabled,
      artifacts_enabled: values.artifacts_enabled
    };
    if (task) {
      await update.mutateAsync({ id: task.id, payload });
    } else {
      await create.mutateAsync(payload);
    }
    onDone();
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Label>
          Proyecto
          <Select {...register("project_id")}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          {errors.project_id && <span className="text-xs text-destructive">{errors.project_id.message}</span>}
        </Label>
        <Label>
          Persona
          <Select {...register("persona_id")}>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          {errors.persona_id && <span className="text-xs text-destructive">{errors.persona_id.message}</span>}
        </Label>
      </div>

      <Label>
        Tipo de experiencia
        <Select {...register("type")}>
          <option value="navigation">Recorrido guiado</option>
          <option value="five_second_test">Prueba de 5 segundos</option>
          <option value="idea">Exploración de idea</option>
        </Select>
      </Label>

      <Label>
        Qué quieres que intente lograr
        <Textarea
          rows={3}
          {...register("prompt")}
          placeholder="Ej: encontrar un plan, entender una propuesta o completar una reserva"
        />
        {errors.prompt && <span className="text-xs text-destructive">{errors.prompt.message}</span>}
      </Label>

      <Label>
        URL del prototipo o contexto
        <Input {...register("url")} placeholder="https://..." />
      </Label>

      <Label>
        Cómo sabremos que le fue bien
        <Textarea rows={2} {...register("success_criteria")} />
      </Label>

      <Label className="flex-row items-center">
        <input type="checkbox" {...register("unlimited_steps")} className="mr-2" />
        <span>Sin máximo de pasos (la persona navega hasta completar o abandonar)</span>
      </Label>

      {!unlimited && (
        <Label>
          Máximo de pasos
          <Input type="number" min={2} max={12} {...register("max_steps", { valueAsNumber: true })} />
        </Label>
      )}

      <div className="grid grid-cols-1 gap-2 text-sm">
        <Label className="flex-row items-center">
          <input type="checkbox" {...register("mcp_enabled")} className="mr-2" />
          <span>Usar ayuda MCP cuando aplique</span>
        </Label>
        <Label className="flex-row items-center">
          <input type="checkbox" {...register("predictive_attention_enabled")} className="mr-2" />
          <span>Estimar atención visual</span>
        </Label>
        <Label className="flex-row items-center">
          <input type="checkbox" {...register("artifacts_enabled")} className="mr-2" />
          <span>Guardar evidencia (screenshots)</span>
        </Label>
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {task ? "Actualizar" : "Crear"}
        </Button>
      </div>
    </form>
  );
}
