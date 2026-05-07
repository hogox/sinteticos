import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Project, ProjectContext } from "@/types/state";
import { Input, Textarea, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useCreateProject, useUpdateProject } from "@/api/queries";

const schema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  description: z.string().optional(),
  domain_brief: z.string().optional(),
  audience_constraints: z.string().optional(),
  prior_findings_text: z.string().optional(),
  do_not_text: z.string().optional()
});

type FormValues = z.infer<typeof schema>;

interface Props {
  project?: Project;
  onDone: () => void;
}

const splitLines = (s?: string) =>
  String(s || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

export function ProjectForm({ project, onDone }: Props) {
  const create = useCreateProject();
  const update = useUpdateProject();
  const ctx: ProjectContext = project?.context || {};

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: project?.name || "",
      description: project?.description || "",
      domain_brief: ctx.domain_brief || "",
      audience_constraints: ctx.audience_constraints || "",
      prior_findings_text: (ctx.prior_findings || []).join("\n"),
      do_not_text: (ctx.do_not || []).join("\n")
    }
  });

  const onSubmit = handleSubmit(async (values) => {
    const payload = {
      name: values.name,
      description: values.description || "",
      context: {
        domain_brief: values.domain_brief || "",
        audience_constraints: values.audience_constraints || "",
        prior_findings: splitLines(values.prior_findings_text),
        do_not: splitLines(values.do_not_text)
      }
    };
    if (project) {
      await update.mutateAsync({ id: project.id, payload });
    } else {
      await create.mutateAsync(payload);
    }
    onDone();
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Label>
        Nombre
        <Input {...register("name")} />
        {errors.name && <span className="text-xs text-destructive">{errors.name.message}</span>}
      </Label>

      <Label>
        Descripción
        <Textarea rows={3} {...register("description")} />
      </Label>

      <fieldset className="border border-border rounded-md p-3 space-y-3">
        <legend className="text-xs font-medium px-1 text-muted-foreground">
          Contexto del dominio (opcional, se inyecta en runs y skills)
        </legend>
        <Label>
          Brief del dominio
          <Textarea rows={2} {...register("domain_brief")} placeholder="Ej: Seguros de viaje LATAM" />
        </Label>
        <Label>
          Restricciones de audiencia
          <Textarea
            rows={2}
            {...register("audience_constraints")}
            placeholder="Ej: +50 años, baja confianza digital"
          />
        </Label>
        <Label>
          Hallazgos previos (uno por línea)
          <Textarea rows={3} {...register("prior_findings_text")} />
        </Label>
        <Label>
          Cosas a evitar (uno por línea)
          <Textarea rows={2} {...register("do_not_text")} />
        </Label>
      </fieldset>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {project ? "Actualizar" : "Crear"}
        </Button>
      </div>
    </form>
  );
}
