import { createRootRouteWithContext, Outlet, useRouterState } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import { Lightbox } from "@/components/Lightbox";
import { ChatDrawer } from "@/components/ChatDrawer";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout
});

function pickBreadcrumb(pathname: string): { breadcrumb: string; title: string } {
  if (pathname === "/") return { breadcrumb: "Workspace", title: "Home" };
  if (pathname.startsWith("/personas/")) return { breadcrumb: "Personas", title: "Detalle" };
  if (pathname === "/personas") return { breadcrumb: "Workspace", title: "Personas" };
  if (pathname.startsWith("/projects/")) return { breadcrumb: "Projects", title: "Detalle" };
  if (pathname === "/projects") return { breadcrumb: "Workspace", title: "Projects" };
  return { breadcrumb: "Workspace", title: "Home" };
}

function RootLayout() {
  const { location } = useRouterState();
  const { breadcrumb, title } = pickBreadcrumb(location.pathname);

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="h-16 border-b border-border bg-card px-6 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              {breadcrumb}
            </p>
            <h2 className="text-lg font-semibold leading-tight">{title}</h2>
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date().toLocaleDateString("es-CL", {
              weekday: "long",
              day: "numeric",
              month: "long"
            })}
          </div>
        </header>
        <main className="flex-1 px-6 py-6 overflow-auto">
          <Outlet />
        </main>
      </div>
      <Lightbox />
      <ChatDrawer />
    </div>
  );
}
