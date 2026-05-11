import { Link } from "@tanstack/react-router";
import type { Persona } from "@/types/state";
import { Badge } from "@/components/ui/Badge";
import { colorFor, initialsOf, labelDigitalLevel } from "@/lib/utils";

interface Props {
  persona: Persona;
  runCount: number;
  chatCount: number;
}

export function PersonaCard({ persona, runCount, chatCount }: Props) {
  const color = colorFor(persona.name || "?");
  const initials = initialsOf(persona.name);

  return (
    <Link
      to="/personas/$personaId"
      params={{ personaId: persona.id }}
      className="block rounded-lg border border-border bg-card p-4 hover:shadow-sm hover:border-primary/40 transition-all"
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="h-10 w-10 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center text-white text-sm font-semibold"
          style={{ background: persona.avatar_url ? "transparent" : color }}
        >
          {persona.avatar_url ? (
            <img src={persona.avatar_url} alt={persona.name} className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <Badge variant={persona.status === "active" ? "success" : "secondary"}>
          {persona.status || "active"}
        </Badge>
      </div>

      <p className="font-semibold leading-tight">{persona.name || "Sin nombre"}</p>
      <p className="text-xs text-muted-foreground">
        {[persona.age, persona.gender, persona.role].filter(Boolean).join(" · ") || "Sin datos"}
      </p>
      {persona.life_context && (
        <p className="text-xs text-muted-foreground mb-1">{persona.life_context}</p>
      )}
      <p className="text-xs text-muted-foreground mb-2">{persona.segment || ""}</p>
      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
        {persona.description || persona.usage_context || "Sin descripción"}
      </p>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline">{labelDigitalLevel(persona.digital_level)}</Badge>
        <Badge variant="outline">{runCount} runs</Badge>
        <Badge variant="outline">{chatCount} chats</Badge>
      </div>
    </Link>
  );
}
