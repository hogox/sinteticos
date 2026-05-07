import { Link } from "@tanstack/react-router";
import type { Project } from "@/types/state";
import { Badge } from "@/components/ui/Badge";
import { colorFor, initialsOf, formatShortDate } from "@/lib/utils";

interface Props {
  project: Project;
  personaCount: number;
  taskCount: number;
  runCount: number;
}

export function ProjectCard({ project, personaCount, taskCount, runCount }: Props) {
  const color = colorFor(project.name || "?");
  const initials = initialsOf(project.name);

  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      className="block rounded-lg border border-border bg-card p-4 hover:shadow-sm hover:border-primary/40 transition-all"
    >
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

      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline">{personaCount} personas</Badge>
        <Badge variant="outline">{taskCount} tasks</Badge>
        <Badge variant="outline">{runCount} runs</Badge>
      </div>
    </Link>
  );
}
