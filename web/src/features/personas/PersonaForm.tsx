import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Persona } from "@/types/state";
import { Input, Textarea, Select, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useCreatePersona, useUpdatePersona } from "@/api/queries";

const schema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  description: z.string().optional(),
  role: z.string().optional(),
  segment: z.string().optional(),
  functional_context: z.string().optional(),
  usage_context: z.string().optional(),
  goals: z.string().optional(),
  motivations: z.string().optional(),
  needs: z.string().optional(),
  behaviors: z.string().optional(),
  pains: z.string().optional(),
  frictions: z.string().optional(),
  personality_traits: z.string().optional(),
  digital_environment: z.string().optional(),
  digital_behavior: z.string().optional(),
  devices: z.string().optional(),
  digital_level: z.enum(["low", "medium", "high"]),
  apps_used: z.string().optional(),
  restrictions: z.string().optional(),
  status: z.enum(["active", "archived"])
});

type FormValues = z.infer<typeof schema>;

interface Props {
  persona?: Persona;
  onDone: () => void;
}

export function PersonaForm({ persona, onDone }: Props) {
  const create = useCreatePersona();
  const update = useUpdatePersona();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: persona?.name || "",
      description: persona?.description || "",
      role: persona?.role || "",
      segment: persona?.segment || "",
      functional_context: persona?.functional_context || "",
      usage_context: persona?.usage_context || "",
      goals: persona?.goals || "",
      motivations: persona?.motivations || "",
      needs: persona?.needs || "",
      behaviors: persona?.behaviors || "",
      pains: persona?.pains || "",
      frictions: persona?.frictions || "",
      personality_traits: persona?.personality_traits || "",
      digital_environment: persona?.digital_environment || "",
      digital_behavior: persona?.digital_behavior || "",
      devices: persona?.devices || "",
      digital_level: (persona?.digital_level as "low" | "medium" | "high") || "medium",
      apps_used: persona?.apps_used || "",
      restrictions: persona?.restrictions || "",
      status: persona?.status || "active"
    }
  });

  const onSubmit = handleSubmit(async (values) => {
    if (persona) {
      await update.mutateAsync({ id: persona.id, payload: values });
    } else {
      await create.mutateAsync(values);
    }
    onDone();
  });

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Label>
          Nombre
          <Input {...register("name")} />
          {errors.name && <span className="text-xs text-destructive">{errors.name.message}</span>}
        </Label>
        <Label>
          Estado
          <Select {...register("status")}>
            <option value="active">Activa</option>
            <option value="archived">Archivada</option>
          </Select>
        </Label>
      </div>

      <Label>
        Descripción corta
        <Textarea rows={2} {...register("description")} />
      </Label>

      <div className="grid grid-cols-2 gap-3">
        <Label>
          Rol
          <Input {...register("role")} placeholder="Ej: Profesional comercial" />
        </Label>
        <Label>
          Segmento
          <Input {...register("segment")} />
        </Label>
      </div>

      <Label>
        Contexto funcional
        <Textarea rows={2} {...register("functional_context")} />
      </Label>

      <Label>
        Contexto de uso
        <Textarea rows={2} {...register("usage_context")} />
      </Label>

      <div className="grid grid-cols-2 gap-3">
        <Label>
          Goals
          <Textarea rows={2} {...register("goals")} />
        </Label>
        <Label>
          Motivaciones
          <Textarea rows={2} {...register("motivations")} />
        </Label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Label>
          Necesidades
          <Textarea rows={2} {...register("needs")} />
        </Label>
        <Label>
          Comportamientos
          <Textarea rows={2} {...register("behaviors")} />
        </Label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Label>
          Pains
          <Textarea rows={2} {...register("pains")} />
        </Label>
        <Label>
          Frictions
          <Textarea rows={2} {...register("frictions")} />
        </Label>
      </div>

      <Label>
        Rasgos de personalidad
        <Input {...register("personality_traits")} />
      </Label>

      <div className="grid grid-cols-2 gap-3">
        <Label>
          Nivel digital
          <Select {...register("digital_level")}>
            <option value="low">Bajo</option>
            <option value="medium">Intermedio</option>
            <option value="high">Alto</option>
          </Select>
        </Label>
        <Label>
          Devices
          <Input {...register("devices")} />
        </Label>
      </div>

      <Label>
        Comportamiento digital
        <Textarea rows={2} {...register("digital_behavior")} />
      </Label>

      <Label>
        Apps usadas
        <Input {...register("apps_used")} />
      </Label>

      <Label>
        Restricciones
        <Textarea rows={2} {...register("restrictions")} />
      </Label>

      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>
        <Button type="submit" disabled={isSubmitting}>{persona ? "Actualizar" : "Crear"}</Button>
      </div>
    </form>
  );
}
