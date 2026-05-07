import { createFileRoute } from "@tanstack/react-router";
import { useAppState } from "@/api/queries";

export const Route = createFileRoute("/personas/$personaId/")({
  component: PerfilTab
});

function FieldBlock({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm mt-0.5">{value}</p>
    </div>
  );
}

function PerfilTab() {
  const { personaId } = Route.useParams();
  const { data: state } = useAppState();
  if (!state) return null;
  const persona = state.personas.find((p) => p.id === personaId);
  if (!persona) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h3 className="font-semibold">Contexto</h3>
        <FieldBlock label="Contexto funcional" value={persona.functional_context} />
        <FieldBlock label="Contexto de uso" value={persona.usage_context} />
        <FieldBlock label="Goals" value={persona.goals} />
        <FieldBlock label="Restricciones" value={persona.restrictions} />
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h3 className="font-semibold">Motivación / Necesidad</h3>
        <FieldBlock label="Motivaciones" value={persona.motivations} />
        <FieldBlock label="Necesidades" value={persona.needs} />
        <FieldBlock label="Comportamientos" value={persona.behaviors} />
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h3 className="font-semibold">Fricciones y dolores</h3>
        <FieldBlock label="Pains" value={persona.pains} />
        <FieldBlock label="Frictions" value={persona.frictions} />
        <FieldBlock label="Personality traits" value={persona.personality_traits} />
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h3 className="font-semibold">Digital</h3>
        <FieldBlock label="Devices" value={persona.devices} />
        <FieldBlock label="Apps usadas" value={persona.apps_used} />
        <FieldBlock label="Comportamiento digital" value={persona.digital_behavior} />
        <FieldBlock label="Entorno digital" value={persona.digital_environment} />
      </div>
    </div>
  );
}
