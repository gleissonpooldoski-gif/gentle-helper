import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Save, Play, Square, Loader2, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getAutomationConfig,
  saveAutomationConfig,
  startAutomation,
  stopAutomation,
  listCampaignHistory,
  type AutomationConfigDTO,
  type CampaignHistoryDTO,
} from "@/modules/automation/automation.functions";

const STORE_OPTIONS: Array<{ slug: string; label: string }> = [
  { slug: "shopee", label: "Shopee" },
  { slug: "mercadolivre", label: "Mercado Livre" },
  { slug: "magalu", label: "Magalu" },
  { slug: "amazon", label: "Amazon" },
];

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function StatusBadge({ status }: { status: AutomationConfigDTO["status"] }) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    running: { label: "Rodando", cls: "bg-emerald-500/15 text-emerald-700", icon: <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> },
    waiting: { label: "Aguardando horário", cls: "bg-amber-500/15 text-amber-700", icon: <Clock className="h-3 w-3" /> },
    error: { label: "Erro", cls: "bg-red-500/15 text-red-700", icon: <AlertTriangle className="h-3 w-3" /> },
    done: { label: "Concluída", cls: "bg-sky-500/15 text-sky-700", icon: <CheckCircle2 className="h-3 w-3" /> },
    idle: { label: "Parada", cls: "bg-muted text-muted-foreground", icon: <Square className="h-3 w-3" /> },
  };
  const m = map[status] ?? map.idle;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold", m.cls)}>
      {m.icon}
      {m.label}
    </span>
  );
}

export function AutomationPanel({ channelId }: { channelId: string }) {
  const getFn = useServerFn(getAutomationConfig);
  const saveFn = useServerFn(saveAutomationConfig);
  const startFn = useServerFn(startAutomation);
  const stopFn = useServerFn(stopAutomation);
  const histFn = useServerFn(listCampaignHistory);

  const [cfg, setCfg] = useState<AutomationConfigDTO | null>(null);
  const [horaInicio, setHoraInicio] = useState("07:00");
  const [horaFim, setHoraFim] = useState("22:00");
  const [intervalo, setIntervalo] = useState(15);
  const [postLoop, setPostLoop] = useState(true);
  const [lojas, setLojas] = useState<string[]>(["shopee", "mercadolivre"]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<CampaignHistoryDTO[]>([]);

  const applyCfg = (c: AutomationConfigDTO) => {
    setCfg(c);
    setHoraInicio(c.horaInicio);
    setHoraFim(c.horaFim);
    setIntervalo(c.intervaloMin);
    setPostLoop(c.postLoop);
    setLojas(c.lojasAtivas);
  };

  const refresh = async () => {
    try {
      const [c, h] = await Promise.all([
        getFn({ data: { channelId } }),
        histFn({ data: { channelId, limit: 5 } }),
      ]);
      setCfg(c);
      setHistory(h);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const c = await getFn({ data: { channelId } });
        applyCfg(c);
        const h = await histFn({ data: { channelId, limit: 5 } });
        setHistory(h);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha ao carregar automação");
      } finally {
        setLoading(false);
      }
    })();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const toggleLoja = (slug: string) => {
    setLojas((p) => (p.includes(slug) ? p.filter((x) => x !== slug) : [...p, slug]));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const c = await saveFn({
        data: {
          channelId,
          horaInicio,
          horaFim,
          intervaloMin: intervalo,
          lojasAtivas: lojas,
          postLoop,
        },
      });
      applyCfg(c);
      toast.success("Configuração salva");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleStart = async () => {
    setBusy(true);
    try {
      await saveFn({
        data: {
          channelId,
          horaInicio,
          horaFim,
          intervaloMin: intervalo,
          lojasAtivas: lojas,
          postLoop,
        },
      });
      const c = await startFn({ data: { channelId } });
      applyCfg(c);
      toast.success(`Automação iniciada · ${c.queueSize} produtos na fila`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao iniciar");
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      const c = await stopFn({ data: { channelId } });
      applyCfg(c);
      toast.success("Automação parada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao parar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Frequência e loop
        </p>
        {cfg && <StatusBadge status={cfg.status} />}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Hora início</label>
              <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="h-10" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Hora fim</label>
              <Input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} className="h-10" />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Intervalo (min)</label>
              <Input
                type="number"
                min={1}
                max={1440}
                value={intervalo}
                onChange={(e) => setIntervalo(Math.max(1, Number(e.target.value) || 1))}
                className="h-10"
              />
            </div>
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={postLoop}
              onChange={(e) => setPostLoop(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Post em Loop
            <span className="text-xs text-muted-foreground">(reinicia ao final da lista)</span>
          </label>

          <p className="mt-5 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Lojas ativas
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {STORE_OPTIONS.map((s) => (
              <label key={s.slug} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={lojas.includes(s.slug)}
                  onChange={() => toggleLoja(s.slug)}
                  className="h-4 w-4 rounded border-border"
                />
                {s.label}
              </label>
            ))}
          </div>

          <div className="mt-5 flex gap-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1 h-10">
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              Salvar
            </Button>
            {cfg?.status === "running" || cfg?.status === "waiting" || cfg?.status === "error" ? (
              <Button onClick={handleStop} disabled={busy} variant="outline" className="flex-1 h-10">
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Square className="mr-1.5 h-4 w-4" />}
                Parar
              </Button>
            ) : (
              <Button onClick={handleStart} disabled={busy} className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-700">
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
                Iniciar
              </Button>
            )}
          </div>

          {cfg && (
            <div className="mt-4 space-y-1.5 rounded-lg border border-border/60 bg-muted/30 p-3 text-[12px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Próximo disparo</span>
                <span className="font-medium">{fmtDateTime(cfg.nextRunAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Produto atual</span>
                <span className="font-medium truncate max-w-[180px]" title={cfg.currentProduct?.title ?? ""}>
                  {cfg.currentProduct ? cfg.currentProduct.title : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fila</span>
                <span className="font-medium">{cfg.queueSize} produtos</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Último envio</span>
                <span className="font-medium">{fmtDateTime(cfg.lastSentAt)}</span>
              </div>
              {cfg.lastError && (
                <div className="mt-2 rounded-md bg-red-500/10 p-2 text-[11px] text-red-700">
                  {cfg.lastError}
                </div>
              )}
            </div>
          )}

          {history.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Últimos envios
              </p>
              <ul className="space-y-1.5">
                {history.map((h) => (
                  <li key={h.id} className="flex items-start justify-between gap-2 text-[11.5px]">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{h.productName ?? "—"}</p>
                      <p className="truncate text-muted-foreground">
                        {h.groupName ?? "—"} · {fmtDateTime(h.sentAt)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        h.status === "sent"
                          ? "bg-emerald-500/15 text-emerald-700"
                          : "bg-red-500/15 text-red-700",
                      )}
                    >
                      {h.status === "sent" ? "OK" : "Falha"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
