import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  Instagram,
  MessageCircle,
  Plus,
  Search,
  Send,
  Shuffle,
  Sparkles,
  Timer,
  Trash2,
  Video,
  X,
  Pencil,
  Package,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AppSidebar } from "@/components/app-sidebar";
import { listChannels, type ChannelDTO } from "@/modules/channels/channels.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Canais/Grupos · DivulgaLinks" },
      {
        name: "description",
        content:
          "Configure seus grupos e organize suas publicações automatizadas em canais do Telegram, WhatsApp, Instagram e Stories.",
      },
      { property: "og:title", content: "Canais/Grupos · DivulgaLinks" },
      {
        property: "og:description",
        content:
          "Painel para automatizar disparos em canais e grupos de ofertas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChannelsPage,
});

/* ---------------- Data model ---------------- */

type SocialStatus = "connected" | "disconnected" | "disabled";

interface Channel {
  id: string;
  name: string;
  telegramId: string;
  autoPost: boolean;
  products: number;
  intervalMin: number;
  random: boolean;
  socials: {
    telegram: SocialStatus;
    whatsapp: SocialStatus;
    instagram: SocialStatus;
    storyAuto: SocialStatus;
  };
  distribution: { label: string; value: number; color: string }[];
  accent: string; // subtle gradient hint
}

function toChannel(row: ChannelDTO): Channel {
  return {
    id: row.id,
    name: row.name,
    telegramId: row.externalId ?? row.id,
    autoPost: row.autoPost,
    products: 0,
    intervalMin: row.intervalMin,
    random: row.randomOrder,
    socials: { telegram: "connected", whatsapp: "connected", instagram: "disconnected", storyAuto: "disabled" },
    distribution: [],
    accent: "from-primary/5 to-transparent",
  };
}

const LIMIT = 5;

/* ---------------- Page ---------------- */

function ChannelsPage() {
  const listChannelsFn = useServerFn(listChannels);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => {
    let cancelled = false;
    void listChannelsFn()
      .then((rows) => {
        if (!cancelled) setChannels(rows.map(toChannel));
      })
      .catch(() => {
        if (!cancelled) setChannels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [listChannelsFn]);
  const filtered = useMemo(
    () => channels.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase())),
    [channels, query],
  );

  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased lg:flex">
      <AppSidebar activeId="canais" />

      <div className="flex-1 lg:min-w-0">
        <main className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-10 sm:px-6 lg:px-10">
          <PageHeader activeCount={channels.length} limit={LIMIT} />

          <div className="mt-8 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:items-center sm:justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar canal ou grupo"
                className="h-10 rounded-full border-border/70 bg-card pl-9"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Exibindo <span className="font-semibold text-foreground">{filtered.length}</span> de {channels.length} canais
            </p>
          </div>

          <section className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((c) => (
              <ChannelCard key={c.id} channel={c} />
            ))}
            <AddChannelTile />
          </section>
        </main>
      </div>
    </div>
  );
}

/* ---------------- Header ---------------- */

function PageHeader({ activeCount, limit }: { activeCount: number; limit: number }) {
  const pct = Math.min(100, (activeCount / limit) * 100);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-6 sm:flex sm:items-end sm:justify-between">
      <div className="min-w-0 max-w-2xl">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" />
          Canais/Grupos
        </div>
        <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-[34px]">
          Gerenciar Grupos de Configuração
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Configure seus grupos e organize suas publicações automatizadas.
        </p>

        <div className="mt-5 flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-semibold text-foreground">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-primary/10 text-primary">
              <Package className="h-3 w-3" />
            </span>
            {activeCount}/{limit} grupos
          </div>
          <div className="hidden h-2 w-40 overflow-hidden rounded-full bg-muted sm:block">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-[oklch(0.72_0.16_256)] transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <Button
        size="lg"
        className="shrink-0 rounded-full bg-primary px-5 shadow-[0_10px_30px_-12px_oklch(0.62_0.19_256/0.6)] hover:bg-primary/90"
      >
        <Plus className="mr-1.5 h-4 w-4" />
        Adicionar Grupo
      </Button>
    </div>
  );
}

/* ---------------- Card ---------------- */

function ChannelCard({ channel }: { channel: Channel }) {
  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.08)] transition-all hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_20px_40px_-20px_rgba(15,23,42,0.15)]",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b opacity-100",
          channel.accent,
        )}
      />

      {/* Header */}
      <header className="relative flex items-start justify-between gap-3 px-5 pb-4 pt-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[oklch(0.68_0.15_235)] to-[oklch(0.55_0.18_245)] text-white shadow-sm">
            <Send className="h-5 w-5" strokeWidth={2.4} />
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-display text-[15px] font-bold uppercase tracking-tight text-foreground">
              {channel.name}
            </h3>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-muted-foreground">
                ID: {channel.telegramId}
              </span>
              <span className="text-[10.5px] text-muted-foreground">· Telegram</span>
            </div>
          </div>
        </div>
        <StatusPill active={channel.autoPost} />
      </header>

      {/* Stats */}
      <div className="relative grid grid-cols-3 gap-2 px-5">
        <Stat label="Produtos" value={channel.products.toLocaleString("pt-BR")} />
        <Stat
          label="Intervalo"
          value={`${channel.intervalMin}min`}
          icon={<Timer className="h-3 w-3" />}
        />
        <Stat
          label="Aleatório"
          value={channel.random ? "On" : "Off"}
          icon={<Shuffle className={cn("h-3 w-3", channel.random ? "text-[color:var(--color-success)]" : "text-muted-foreground/60")} />}
          tone={channel.random ? "success" : "muted"}
        />
      </div>

      {/* Socials */}
      <div className="relative mt-4 grid grid-cols-2 gap-2 px-5">
        <SocialRow icon={Send} label="Telegram" status={channel.socials.telegram} />
        <SocialRow icon={MessageCircle} label="WhatsApp" status={channel.socials.whatsapp} />
        <SocialRow icon={Instagram} label="Instagram" status={channel.socials.instagram} />
        <SocialRow icon={Video} label="Story Auto" status={channel.socials.storyAuto} />
      </div>

      {/* Distribution chart */}
      <div className="relative mt-5 px-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Produtos por plataforma
          </p>
          <span className="text-[11px] text-muted-foreground">Últimos 30d</span>
        </div>
        <MiniBarChart items={channel.distribution} />
      </div>

      {/* Actions */}
      <footer className="relative mt-5 flex items-center gap-2 border-t border-border/70 bg-muted/30 px-5 py-3">
        <Button
          asChild
          size="sm"
          className="h-9 flex-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Link to="/canais/$id/editar" params={{ id: channel.id }}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Editar
          </Link>
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-9 rounded-lg border-[color:var(--color-danger)]/25 bg-[color:var(--color-danger)]/5 text-[color:var(--color-danger)] hover:bg-[color:var(--color-danger)]/10 hover:text-[color:var(--color-danger)]"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="sr-only">Excluir</span>
        </Button>
      </footer>
    </article>
  );
}

/* ---------------- Bits ---------------- */

function StatusPill({ active }: { active: boolean }) {
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Post Auto
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide",
          active
            ? "bg-[color:var(--color-success)]/12 text-[color:var(--color-success)]"
            : "bg-[color:var(--color-danger)]/10 text-[color:var(--color-danger)]",
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            active ? "bg-[color:var(--color-success)] shadow-[0_0_0_3px_oklch(0.72_0.15_150/0.15)]" : "bg-[color:var(--color-danger)]",
          )}
        />
        {active ? "Ativo" : "Desativado"}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: "default" | "success" | "muted";
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-0.5 flex items-center gap-1">
        {icon}
        <span
          className={cn(
            "font-display text-[15px] font-bold leading-tight",
            tone === "success" && "text-[color:var(--color-success)]",
            tone === "muted" && "text-muted-foreground",
            tone === "default" && "text-foreground",
          )}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

function SocialRow({
  icon: Icon,
  label,
  status,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  status: SocialStatus;
}) {
  const connected = status === "connected";
  const disabled = status === "disabled";

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5",
        connected
          ? "border-[color:var(--color-success)]/25 bg-[color:var(--color-success)]/8"
          : disabled
            ? "border-border/60 bg-muted/60"
            : "border-[color:var(--color-danger)]/20 bg-[color:var(--color-danger)]/5",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <Icon
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            connected
              ? "text-[color:var(--color-success)]"
              : disabled
                ? "text-muted-foreground"
                : "text-[color:var(--color-danger)]",
          )}
        />
        <span className="truncate text-[11.5px] font-semibold text-foreground">
          {label}
        </span>
      </div>
      {connected ? (
        <Check className="h-3 w-3 text-[color:var(--color-success)]" strokeWidth={3} />
      ) : (
        <X
          className={cn(
            "h-3 w-3",
            disabled ? "text-muted-foreground" : "text-[color:var(--color-danger)]",
          )}
          strokeWidth={3}
        />
      )}
    </div>
  );
}

function MiniBarChart({
  items,
}: {
  items: { label: string; value: number; color: string }[];
}) {
  const max = Math.max(...items.map((i) => i.value));
  return (
    <div>
      <div className="flex items-end gap-2 h-16">
        {items.map((it) => {
          const h = Math.max(8, (it.value / max) * 100);
          return (
            <div key={it.label} className="flex flex-1 flex-col items-center gap-1">
              <div className="relative flex h-full w-full items-end">
                <div
                  className="w-full rounded-t-md transition-all"
                  style={{ height: `${h}%`, backgroundColor: it.color, opacity: 0.85 }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {items.map((it) => (
          <div key={it.label} className="flex flex-1 items-center gap-1 min-w-0">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: it.color }}
            />
            <span className="truncate text-[10px] font-medium text-muted-foreground">
              {it.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddChannelTile() {
  return (
    <button
      type="button"
      className="group flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-transparent px-6 py-10 text-center transition-all hover:border-primary/40 hover:bg-primary/[0.03]"
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-110">
        <Plus className="h-5 w-5" strokeWidth={2.5} />
      </span>
      <div>
        <p className="font-display text-sm font-semibold text-foreground">
          Adicionar novo grupo
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Conecte um canal do Telegram, WhatsApp ou Instagram.
        </p>
      </div>
    </button>
  );
}
