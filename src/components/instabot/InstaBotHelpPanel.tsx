import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Instagram,
  Sparkles,
  Loader2,
  Save,
  Trash2,
  RefreshCw,
  Check,
  MessageCircle,
  Send,
  BarChart3,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  listInstagramMedia,
  listAutomations,
  upsertAutomation,
  deleteAutomation,
  toggleAutomation,
  listAutomationHistory,
  getChannelStats,
  generateAutomationWithAI,
  type InstabotAutomationDTO,
  type InstabotMediaDTO,
  type InstabotEventDTO,
  type InstabotStatsDTO,
} from "@/lib/instabot.functions";

type Tab = "auto" | "hist" | "stats";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

export function InstaBotHelpPanel({ channelId }: { channelId: string }) {
  const [tab, setTab] = useState<Tab>("auto");
  const [media, setMedia] = useState<InstabotMediaDTO[]>([]);
  const [autos, setAutos] = useState<InstabotAutomationDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ media?: InstabotMediaDTO; automation?: InstabotAutomationDTO } | null>(
    null,
  );

  const mediaFn = useServerFn(listInstagramMedia);
  const listFn = useServerFn(listAutomations);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, a] = await Promise.all([
        mediaFn({ data: { channelId } }).catch((e) => {
          setError(e instanceof Error ? e.message : String(e));
          return [] as InstabotMediaDTO[];
        }),
        listFn({ data: { channelId } }),
      ]);
      setMedia(m);
      setAutos(a);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const autoByMedia = useMemo(() => {
    const map = new Map<string, InstabotAutomationDTO>();
    for (const a of autos) map.set(a.igMediaId, a);
    return map;
  }, [autos]);

  return (
    <div className="mt-6 space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border/70 p-6 text-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_40px_-24px_rgba(220,80,120,0.55)]">
        <div className="absolute inset-0 bg-[linear-gradient(115deg,#4f5bd5_0%,#962fbf_40%,#d62976_70%,#fa7e1e_100%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/20 backdrop-blur">
              <Sparkles className="h-6 w-6" strokeWidth={2.2} />
            </span>
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">🤖 InstaBotHelp</h2>
              <p className="text-[13px] text-white/90">
                Automação de comentários e Direct para este canal.
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1 rounded-full bg-white/15 p-1 backdrop-blur">
            {[
              { id: "auto" as const, label: "Automações", icon: <Sparkles className="h-3.5 w-3.5" /> },
              { id: "hist" as const, label: "Histórico", icon: <History className="h-3.5 w-3.5" /> },
              { id: "stats" as const, label: "Estatísticas", icon: <BarChart3 className="h-3.5 w-3.5" /> },
            ].map((t) => {
              const on = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-all",
                    on
                      ? "bg-white text-[oklch(0.45_0.22_320)] shadow-sm"
                      : "text-white/85 hover:bg-white/10",
                  )}
                >
                  {t.icon}
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {tab === "auto" && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-muted-foreground">
              {loading ? "Carregando publicações…" : `${media.length} publicação(ões) do Instagram · ${autos.length} automação(ões) configurada(s)`}
            </p>
            <Button variant="outline" size="sm" onClick={reload} disabled={loading} className="h-9 gap-1.5">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Atualizar
            </Button>
          </div>

          {error && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-[13px] text-amber-800">
              {error.includes("access_token") || error.includes("connection") || error.includes("permission")
                ? "Conecte o Instagram na aba Instagram para carregar suas publicações."
                : error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando publicações…
            </div>
          ) : media.length === 0 && !error ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 p-8 text-center text-sm text-muted-foreground">
              Nenhuma publicação encontrada no Instagram conectado.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {media.map((m) => {
                const a = autoByMedia.get(m.id);
                return (
                  <MediaCard
                    key={m.id}
                    media={m}
                    automation={a}
                    onEdit={() => setEditing({ media: m, automation: a })}
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "hist" && <HistoryTab channelId={channelId} />}
      {tab === "stats" && <StatsTab channelId={channelId} />}

      {editing && (
        <AutomationEditor
          channelId={channelId}
          media={editing.media}
          automation={editing.automation}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await reload();
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/* -------- Media Card -------- */

function MediaCard({
  media,
  automation,
  onEdit,
}: {
  media: InstabotMediaDTO;
  automation?: InstabotAutomationDTO;
  onEdit: () => void;
}) {
  const thumb = media.thumbnailUrl ?? media.mediaUrl;
  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.1)] transition-all hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_40px_-20px_rgba(15,23,42,0.18)]">
      <div className="relative aspect-[9/14] w-full overflow-hidden bg-muted">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-4xl">📷</div>
        )}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md bg-black/45 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
          <Instagram className="h-3 w-3" strokeWidth={2.6} />
          {media.mediaType?.toLowerCase().includes("video") ? "Reel" : "Post"}
        </span>
        {automation?.enabled && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md bg-emerald-500/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
            <Check className="h-3 w-3" /> Ativa
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="line-clamp-3 min-h-[54px] text-[12.5px] leading-snug text-foreground/85">
          {media.caption ?? "Sem legenda"}
        </p>
        <p className="text-[11px] text-muted-foreground">{fmtDate(media.timestamp)}</p>
        <Button size="sm" onClick={onEdit} className="mt-auto h-9 gap-1.5 rounded-lg text-[12px] font-semibold">
          {automation ? <Save className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
          {automation ? "Editar automação" : "Nova automação"}
        </Button>
      </div>
    </div>
  );
}

/* -------- Editor Modal -------- */

function AutomationEditor({
  channelId,
  media,
  automation,
  onClose,
  onSaved,
}: {
  channelId: string;
  media?: InstabotMediaDTO;
  automation?: InstabotAutomationDTO;
  onClose: () => void;
  onSaved: () => void;
}) {
  const saveFn = useServerFn(upsertAutomation);
  const delFn = useServerFn(deleteAutomation);
  const aiFn = useServerFn(generateAutomationWithAI);

  const [enabled, setEnabled] = useState(automation?.enabled ?? true);
  const [keywords, setKeywords] = useState(
    (automation?.keywords ?? ["QUERO", "LINK"]).join("\n"),
  );
  const [replies, setReplies] = useState(
    automation?.commentReplyMode === "auto"
      ? "auto"
      : (automation?.commentReplies ?? [
          "Confira seu Direct 😊",
          "Acabei de enviar!",
          "Olha sua caixa de entrada!",
          "Enviado 😊",
        ]).join("\n"),
  );
  const [dmMessage, setDmMessage] = useState(
    automation?.dmMessage ??
      "Olá 😊\n\nObrigado pelo interesse!\nClique no botão abaixo para ver o produto.",
  );
  const [buttonLabel, setButtonLabel] = useState(automation?.buttonLabel ?? "VER PRODUTO");
  const [buttonUrl, setButtonUrl] = useState(automation?.buttonUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [removing, setRemoving] = useState(false);

  const igMediaId = automation?.igMediaId ?? media?.id;
  const caption = automation?.caption ?? media?.caption ?? null;

  const handleSave = async () => {
    if (!igMediaId) return;
    const kwList = keywords.split("\n").map((s) => s.trim()).filter(Boolean);
    if (kwList.length === 0) {
      toast.error("Adicione ao menos uma palavra-chave");
      return;
    }
    if (!dmMessage.trim()) {
      toast.error("A mensagem do Direct é obrigatória");
      return;
    }
    if (!buttonUrl.trim()) {
      toast.error("Informe o link de destino do botão");
      return;
    }
    const replyMode: "auto" | "list" = replies.trim().toLowerCase() === "auto" ? "auto" : "list";
    const replyList =
      replyMode === "auto"
        ? []
        : replies.split("\n").map((s) => s.trim()).filter(Boolean);
    setSaving(true);
    try {
      await saveFn({
        data: {
          id: automation?.id,
          channelId,
          igMediaId,
          igMediaUrl: media?.permalink ?? automation?.igMediaUrl ?? null,
          thumbnailUrl: media?.thumbnailUrl ?? media?.mediaUrl ?? automation?.thumbnailUrl ?? null,
          caption,
          postedAt: media?.timestamp ?? automation?.postedAt ?? null,
          enabled,
          keywords: kwList.map((k) => k.toUpperCase()),
          commentReplyMode: replyMode,
          commentReplies: replyList,
          dmMessage: dmMessage.trim(),
          buttonLabel: buttonLabel.trim() || "VER PRODUTO",
          buttonUrl: buttonUrl.trim(),
        },
      });
      toast.success("Automação salva");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleAI = async () => {
    setAiBusy(true);
    try {
      const r = await aiFn({ data: { caption, niche: null } });
      if (r.keywords.length) setKeywords(r.keywords.join("\n"));
      if (r.commentReplies.length) setReplies(r.commentReplies.join("\n"));
      if (r.dmMessage) setDmMessage(r.dmMessage);
      if (r.buttonLabel) setButtonLabel(r.buttonLabel);
      toast.success("Sugestões geradas pela IA");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar");
    } finally {
      setAiBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!automation?.id) return;
    if (!confirm("Excluir esta automação?")) return;
    setRemoving(true);
    try {
      await delFn({ data: { id: automation.id } });
      toast.success("Automação excluída");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/70 px-6 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Publicação</p>
            <h3 className="truncate text-[15px] font-bold">
              {caption ?? "Sem legenda"}
            </h3>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <span className="font-semibold">Ativar InstaBotHelp para esta publicação</span>
          </label>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Palavras-chave gatilho (uma por linha)
              </label>
            </div>
            <textarea
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              rows={4}
              placeholder={"QUERO\nLINK\nEU QUERO\nPROMOÇÃO"}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Resposta automática ao comentário
            </label>
            <textarea
              value={replies}
              onChange={(e) => setReplies(e.target.value)}
              rows={4}
              placeholder={'Escreva "auto" para a IA gerar ou várias frases (uma por linha)'}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Se digitar <code className="rounded bg-muted px-1">auto</code>, o sistema pede à IA. Caso contrário, alterna aleatoriamente entre as frases.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Mensagem enviada no Direct
            </label>
            <textarea
              value={dmMessage}
              onChange={(e) => setDmMessage(e.target.value)}
              rows={6}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr]">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Texto do botão
              </label>
              <Input
                value={buttonLabel}
                maxLength={20}
                onChange={(e) => setButtonLabel(e.target.value)}
                placeholder="VER NA SHOPEE"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Link (URL de afiliado)
              </label>
              <Input
                value={buttonUrl}
                onChange={(e) => setButtonUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-muted/30 px-6 py-4">
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleAI} disabled={aiBusy} className="h-10 gap-1.5">
              {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Gerar automaticamente
            </Button>
            {automation?.id && (
              <Button variant="outline" onClick={handleDelete} disabled={removing} className="h-10 gap-1.5 text-red-600 hover:bg-red-50">
                {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Excluir
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="h-10">
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="h-10 gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------- History Tab -------- */

function HistoryTab({ channelId }: { channelId: string }) {
  const histFn = useServerFn(listAutomationHistory);
  const [rows, setRows] = useState<InstabotEventDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await histFn({ data: { channelId, limit: 100 } });
        setRows(r);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha ao carregar histórico");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Nenhum evento registrado ainda.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <table className="w-full text-[13px]">
        <thead className="bg-muted/50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 text-left">Usuário</th>
            <th className="px-4 py-2.5 text-left">Comentário</th>
            <th className="px-4 py-2.5 text-left">Data</th>
            <th className="px-4 py-2.5 text-left">DM enviada</th>
            <th className="px-4 py-2.5 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border/60">
              <td className="px-4 py-2.5 font-medium">{r.igUsername ?? "—"}</td>
              <td className="px-4 py-2.5 max-w-[280px] truncate" title={r.commentText ?? ""}>
                {r.commentText ?? "—"}
              </td>
              <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(r.createdAt)}</td>
              <td className="px-4 py-2.5">
                {r.dmSent ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <Send className="h-3 w-3" /> Sim
                  </span>
                ) : (
                  <span className="text-muted-foreground">Não</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    r.status === "ok"
                      ? "bg-emerald-500/15 text-emerald-700"
                      : "bg-red-500/15 text-red-700",
                  )}
                >
                  {r.status === "ok" ? "OK" : r.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------- Stats Tab -------- */

function StatsTab({ channelId }: { channelId: string }) {
  const statsFn = useServerFn(getChannelStats);
  const [s, setS] = useState<InstabotStatsDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setS(await statsFn({ data: { channelId } }));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha ao carregar estatísticas");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  if (loading || !s) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }
  const cards = [
    { label: "Comentários detectados", value: s.detected, icon: <MessageCircle className="h-4 w-4" /> },
    { label: "Mensagens enviadas", value: s.dmsSent, icon: <Send className="h-4 w-4" /> },
    { label: "Cliques no botão", value: s.clicks, icon: <Sparkles className="h-4 w-4" /> },
    { label: "Taxa de resposta", value: `${s.responseRate}%`, icon: <BarChart3 className="h-4 w-4" /> },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-2xl border border-border/70 bg-card p-5">
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            {c.icon}
            <span className="text-[11px] font-semibold uppercase tracking-wider">{c.label}</span>
          </div>
          <p className="font-display text-3xl font-bold">{c.value}</p>
        </div>
      ))}
    </div>
  );
}
