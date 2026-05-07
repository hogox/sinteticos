import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAppState, useDeletePersona } from "@/api/queries";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PersonaCreateDialog } from "@/features/personas/PersonaCreateDialog";
import type { Persona } from "@/types/state";
import { colorFor, initialsOf, labelDigitalLevel } from "@/lib/utils";

export const Route = createFileRoute("/personas/")({
  component: PersonasPage
});

function PersonasPage() {
  const { data: state, isLoading } = useAppState();
  const [editing, setEditing] = useState<Persona | null>(null);
  const [creating, setCreating] = useState(false);

  if (isLoading || !state) return <p className="text-muted-foreground">Cargando…</p>;

  const personas = state.personas || [];
  const runs = state.runs || [];
  const conversations = state.persona_conversations || [];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold">Todas las personas</h2>
          <p className="text-sm text-muted-foreground">{personas.length} en total</p>
        </div>
        <Button onClick={() => setCreating(true)}>+ Nueva persona</Button>
      </div>

      {personas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Aún no hay personas. Creá una para empezar.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {personas.map((persona) => (
            <PersonaCard
              key={persona.id}
              persona={persona}
              runCount={runs.filter((r) => r.persona_id === persona.id).length}
              chatCount={conversations.filter((c) => c.persona_id === persona.id).length}
              onEdit={() => setEditing(persona)}
            />
          ))}
        </div>
      )}

      <PersonaCreateDialog
        open={creating || !!editing}
        onOpenChange={(o) => !o && (setCreating(false), setEditing(null))}
        editing={editing}
      />

    </div>
  );
}

interface CardProps {
  persona: Persona;
  runCount: number;
  chatCount: number;
  onEdit: () => void;
}

function PersonaCard({ persona, runCount, chatCount, onEdit }: CardProps) {
  const del = useDeletePersona();
  const onDelete = () => {
    if (confirm(`¿Eliminar a "${persona.name}"?`)) del.mutate(persona.id);
  };

  const color = colorFor(persona.name || "?");
  const initials = initialsOf(persona.name);

  return (
    <div className="rounded-lg border border-border bg-card p-4 hover:shadow-sm hover:border-primary/40 transition-all">
      <Link to="/personas/$personaId" params={{ personaId: persona.id }} className="block">
        <div className="flex items-start justify-between mb-3">
          <div
            className="h-10 w-10 rounded-full text-white text-sm font-semibold flex items-center justify-center"
            style={{ background: color }}
          >
            {initials}
          </div>
          <Badge variant={persona.status === "active" ? "success" : "secondary"}>
            {persona.status || "active"}
          </Badge>
        </div>

        <p className="font-semibold leading-tight">{persona.name}</p>
        <p className="text-xs text-muted-foreground mb-2">
          {persona.segment || "Sin segmento"} · {persona.role || "Sin rol"}
        </p>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
          {persona.description || persona.usage_context || "Sin descripción"}
        </p>

        <div className="flex flex-wrap gap-1.5 mb-3">
          <Badge variant="outline">{labelDigitalLevel(persona.digital_level)}</Badge>
          <Badge variant="outline">{runCount} runs</Badge>
          <Badge variant="outline">{chatCount} chats</Badge>
        </div>
      </Link>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}>Editar</Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>Eliminar</Button>
      </div>
    </div>
  );
}
