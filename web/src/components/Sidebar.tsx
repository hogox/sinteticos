import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/cn";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  matchPrefix?: string;
}

const items: NavItem[] = [
  { to: "/", label: "Home", icon: "HO" },
  { to: "/personas", label: "Personas", icon: "PE", matchPrefix: "/personas" },
  { to: "/projects", label: "Projects", icon: "PR", matchPrefix: "/projects" }
];

export function Sidebar() {
  const { location } = useRouterState();
  const path = location.pathname;

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-card flex flex-col">
      <div className="px-4 py-4 border-b border-border">
        <Link to="/" className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
            SL
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">Sinteticos Lab</p>
            <p className="text-xs text-muted-foreground">Research Ops</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-1" aria-label="Secciones">
        {items.map((item) => {
          const isActive =
            item.to === "/" ? path === "/" : item.matchPrefix ? path.startsWith(item.matchPrefix) : path === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
            >
              <span className="h-6 w-6 inline-flex items-center justify-center rounded text-[10px] font-bold tracking-wider bg-muted text-muted-foreground">
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-border space-y-2 text-xs">
        <a
          href="http://localhost:8787"
          className="block text-muted-foreground hover:text-foreground"
        >
          ↩ Volver a app legacy
        </a>
        <p className="text-muted-foreground">v0.2 · web/</p>
      </div>
    </aside>
  );
}
