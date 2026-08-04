import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, RefreshCw } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { getSystemDiagnostics, type SystemHealth } from "@/modules/health/health.functions";

export const Route = createFileRoute("/saude")({
  head: () => ({
    meta: [
      { title: "Saúde do Sistema | DivulgaLinks" },
      {
        name: "description",
        content: "Diagnóstico em tempo real: Evolution API, WhatsApp, automações, filas e erros recentes.",
      },
      { property: "og:title", content: "Saúde do Sistema | DivulgaLinks" },
      {
        property: "og:description",
        content: "Diagnóstico em tempo real das automações, filas e integrações do DivulgaLinks.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HealthPage,
});

function fmt(dt: string | null | undefined) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("pt-BR");
}

function Dot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  return <span aria-hidden>{ok ? (warn ? "🟡" : "🟢") : "🔴"}</span>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "bad" | "warn" }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/40 py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={tone === "bad" ? "font-semibold text-destructive" : tone === "warn" ? "font-semibold text-amber-500" : "font-medium"}>
        {value}
      </span>
    </div>
  );
}

function HealthPage() {
  const load = useServerFn(getSystemDiagnostics);
  const { data, isLoading, isFetching, refetch } = useQuery<SystemHealth>({
    queryKey: ["system-health"],
    queryFn: () => load(),
    refetchInterval: 30_000,
  });

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar activeId="saude" />
      <main className="flex-1 p-6 lg:p-10">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-semibold">Saúde do Sistema</h1>
              <p className="text-sm text-muted-foreground">
                Atualizado: {data ? fmt(data.checkedAt) : "—"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-1.5 text-sm hover:bg-muted"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </header>

        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground">Carregando diagnóstico…</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Cloudflare Tunnel">
              <Row
                label="Status"
                value={
                  <span>
                    {data.tunnel.status === "OFFLINE" || data.tunnel.status === "ERROR"
                      ? "🔴"
                      : data.tunnel.status === "CHANGED"
                        ? "🟡"
                        : "🟢"}{" "}
                    {data.tunnel.status === "ONLINE"
                      ? "Online"
                      : data.tunnel.status === "CHANGED"
                        ? "URL alterada (sincronizada)"
                        : data.tunnel.status === "ERROR"
                          ? "Configuração com erro"
                          : "Offline"}
                  </span>
                }
                tone={data.tunnel.status === "ONLINE" ? undefined : "bad"}
              />
              <Row label="URL atual" value={data.tunnel.currentUrl ?? "—"} />
              {data.tunnel.previousUrl ? (
                <Row label="URL anterior" value={data.tunnel.previousUrl} />
              ) : null}
              <Row label="Última verificação" value={fmt(data.tunnel.lastCheck)} />
              <Row label="Última alteração" value={fmt(data.tunnel.lastChange)} />
              {data.tunnel.errorMessage ? (
                <Row label="Erro" value={data.tunnel.errorMessage} tone="bad" />
              ) : null}
            </Card>

            <Card title="Integrações">
              <Row label="PostgreSQL" value={<span>🟢 Online</span>} />
              <Row
                label="Redis (Evolution)"
                value={
                  <span>
                    {data.evolution.online ? "🟢 Online" : "🔴 Indisponível"}
                  </span>
                }
                tone={data.evolution.online ? undefined : "bad"}
              />
              <Row
                label="Evolution API"
                value={
                  <>
                    <Dot ok={data.evolution.online} /> {data.evolution.online ? "Online" : "Offline"}
                    {data.evolution.latencyMs != null ? ` · ${data.evolution.latencyMs}ms` : ""}
                  </>
                }
                tone={data.evolution.online ? undefined : "bad"}
              />
              {data.evolution.error ? <Row label="Último erro" value={data.evolution.error} tone="bad" /> : null}
            </Card>

            <Card title="Automações">
              <Row label="Ativas (running)" value={data.automation.running} />
              <Row label="Aguardando" value={data.automation.waiting} />
              <Row label="Em erro" value={data.automation.error} tone={data.automation.error > 0 ? "bad" : undefined} />
              <Row label="Último envio" value={fmt(data.automation.lastSentAt)} />
              <Row
                label="Tempo sem envio"
                value={data.automation.minutesSinceLastSend == null ? "—" : `${data.automation.minutesSinceLastSend} min`}
                tone={(data.automation.minutesSinceLastSend ?? 0) > 60 ? "warn" : undefined}
              />
            </Card>

            <Card title="Fila de envios">
              <Row label="Em processamento" value={data.queue.processing} />
              <Row
                label={`Presos > 10 min`}
                value={data.queue.stuckProcessing}
                tone={data.queue.stuckProcessing > 0 ? "bad" : undefined}
              />
              <Row label="Enviados (24h)" value={data.queue.sentLast24h} />
              <Row
                label="Falhados (24h)"
                value={data.queue.failedLast24h}
                tone={data.queue.failedLast24h > 0 ? "warn" : undefined}
              />
            </Card>

            <Card title="Instâncias WhatsApp">
              {data.instances.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma instância registrada.</p>
              ) : (
                data.instances.map((i) => (
                  <Row
                    key={i.id}
                    label={i.name}
                    value={
                      <>
                        <Dot ok={i.status === "connected" || i.status === "open"} warn={i.stalled} />{" "}
                        {i.stalled ? "Conectada sem enviar" : i.status ?? "—"} ·{" "}
                        {i.minutesIdle == null ? "sem envios" : `${i.minutesIdle} min`}
                      </>
                    }
                    tone={i.stalled ? "warn" : i.status === "connected" || i.status === "open" ? undefined : "bad"}
                  />
                ))
              )}
            </Card>

            <Card title="Erros recentes">
              <Row
                label="Falhas não resolvidas"
                value={data.failures.unresolved}
                tone={data.failures.unresolved > 0 ? "warn" : undefined}
              />
              {data.failures.recent.map((f) => (
                <Row key={f.id} label={fmt(f.createdAt)} value={<span className="line-clamp-1 max-w-[28rem]">{f.message}</span>} />
              ))}
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
