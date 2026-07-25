import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  BarChart3,
  CreditCard,
  Instagram,
  LayoutDashboard,
  Menu,
  Radio,
  Send,
  Settings,
  X,
  Zap,
} from "lucide-react";



import { cn } from "@/lib/utils";

type Item = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
};

const MAIN: Item[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
];

const CONFIG: Item[] = [
  { id: "afiliados", label: "Config Afiliados", icon: Settings, href: "/config-afiliados" },
  { id: "canais", label: "Canais/Grupos", icon: Radio, href: "/" },
  { id: "relatorios", label: "Relatórios", icon: BarChart3, href: "/relatorios" },
  { id: "envios-whatsapp", label: "Envios WhatsApp", icon: Send, href: "/configuracoes/envios-whatsapp" },
];


export function AppSidebar({
  activeId,
  onSelect,
}: {
  activeId?: string;
  onSelect?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const resolvedActive =
    activeId ??
    [...MAIN, ...CONFIG].find((i) => i.href && i.href === pathname)?.id ??
    "";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir menu"
        className="fixed left-4 top-4 z-40 grid h-10 w-10 place-items-center rounded-xl border border-border/70 bg-card text-foreground shadow-sm lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border/70 bg-card transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex items-center justify-between px-6 pb-4 pt-6">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.72_0.16_256)] text-primary-foreground shadow-[0_6px_20px_-8px_oklch(0.62_0.19_256/0.6)]">
              <Zap className="h-4 w-4" strokeWidth={2.5} />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-foreground">
              DivulgaLinks
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          <ul className="space-y-1">
            {MAIN.map((item) => (
              <NavRow
                key={item.id}
                item={item}
                active={item.id === resolvedActive}
                onNavigate={() => {
                  onSelect?.(item.id);
                  setOpen(false);
                }}
              />
            ))}
          </ul>

          <div className="mt-6 px-3">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Configurações:
              </span>
              <span className="h-px flex-1 bg-border/70" />
            </div>
          </div>

          <ul className="mt-3 space-y-1">
            {CONFIG.map((item) => (
              <NavRow
                key={item.id}
                item={item}
                active={item.id === resolvedActive}
                onNavigate={() => {
                  onSelect?.(item.id);
                  setOpen(false);
                }}
              />
            ))}
          </ul>
        </nav>

        <div className="border-t border-border/70 px-6 py-5">
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[oklch(0.82_0.16_75)] to-[oklch(0.78_0.17_55)] px-4 py-1.5 text-xs font-bold text-white shadow-[0_6px_20px_-8px_oklch(0.78_0.17_55/0.7)]">
              <CreditCard className="h-3.5 w-3.5" />
              R$ 500/MÊS
            </span>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            v1.18.62
          </p>
        </div>
      </aside>
    </>
  );
}

function NavRow({
  item,
  active,
  onNavigate,
}: {
  item: Item;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  const classes = cn(
    "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
    active
      ? "bg-primary/10 text-primary shadow-[inset_3px_0_0_0_var(--color-primary)]"
      : "text-foreground/75 hover:bg-muted hover:text-foreground",
  );
  const iconClasses = cn(
    "h-[18px] w-[18px] shrink-0 transition-colors",
    active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
  );

  const content = (
    <>
      <Icon className={iconClasses} />
      <span className="truncate">{item.label}</span>
    </>
  );

  return (
    <li>
      {item.href ? (
        <Link to={item.href} className={classes} onClick={onNavigate}>
          {content}
        </Link>
      ) : (
        <button type="button" onClick={onNavigate} className={classes}>
          {content}
        </button>
      )}
    </li>
  );
}
