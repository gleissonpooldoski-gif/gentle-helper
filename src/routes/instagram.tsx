import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { cn } from "@/lib/utils";
import { FileImage, Image as ImageIcon, MessageCircle, MessageSquare, Settings2, Zap } from "lucide-react";

const TABS = [
  { to: "/instagram/configuracoes", label: "Configurações", icon: Settings2 },
  { to: "/instagram/publicacoes", label: "Publicações", icon: FileImage },
  { to: "/instagram/stories", label: "Stories", icon: ImageIcon },
  { to: "/instagram/comentarios", label: "Comentários", icon: MessageCircle },
  { to: "/instagram/mensagens", label: "Mensagens", icon: MessageSquare },
  { to: "/instagram/automacoes", label: "Automações", icon: Zap },
] as const;

export function InstagramLayout({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar activeId="instagram" />
      <main className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-10">
        <header className="mb-6">
          <h1 className="font-display text-2xl font-bold tracking-tight">Instagram</h1>
          <p className="text-sm text-muted-foreground">
            Módulo gerenciado com a Meta Graph API — conta única do administrador.
          </p>
        </header>
        <nav className="mb-6 flex flex-wrap gap-2 border-b border-border/70 pb-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = pathname === t.to;
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/70 hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </Link>
            );
          })}
        </nav>
        {children}
      </main>
    </div>
  );
}

export const Route = createFileRoute("/instagram")({
  head: () => ({
    meta: [
      { title: "Instagram · DivulgaLinks" },
      { name: "description", content: "Automação Instagram via Meta Graph API." },
    ],
  }),
  component: () => (
    <InstagramLayout>
      <RedirectToConfig />
    </InstagramLayout>
  ),
});

function RedirectToConfig() {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-6 text-sm text-muted-foreground">
      Selecione uma aba acima para começar.
    </div>
  );
}
