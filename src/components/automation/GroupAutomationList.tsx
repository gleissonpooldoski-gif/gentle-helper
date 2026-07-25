import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  Pencil,
  Users,
  Smartphone,
  Package,
  Pause,
  Play,
  Clock,
  Eye,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listAutomationGroups,
  listGroupProducts,
  toggleGroupAutomation,
  type AutomationGroupDTO,
  type GroupProductDTO,
} from "@/modules/automation/automation.functions";
import { AutomationPanel } from "./AutomationPanel";

/**
 * Cada card = 1 WhatsApp × 1 grupo. Sem empilhamento — cada unidade
 * tem seus próprios contadores (produtos, último envio, status) e
 * ações isoladas (Editar, Ver produtos, Configurar horários, Pausar).
 */
export function GroupAutomationList({ channelId }: { channelId: string }) {
  const listFn = useServerFn(listAutomationGroups);
  const [groups, setGroups] = useState<AutomationGroupDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AutomationGroupDTO | null>(null);
  const [viewingProducts, setViewingProducts] = useState<AutomationGroupDTO | null>(null);

  const reload = async () => {
    try {
      const g = await listFn({ data: { channelId } });
      setGroups(g);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar grupos");
    }
  };

  useEffect(() => {
    setGroups(null);
    setEditing(null);
    setError(null);
    reload();
    const refreshVisibleCards = () => {
      if (document.visibilityState === "visible") void reload();
    };
    window.addEventListener("focus", refreshVisibleCards);
    document.addEventListener("visibilitychange", refreshVisibleCards);
    const refreshTimer = window.setInterval(refreshVisibleCards, 30_000);
    return () => {
      window.removeEventListener("focus", refreshVisibleCards);
      document.removeEventListener("visibilitychange", refreshVisibleCards);
      window.clearInterval(refreshTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-[13px] text-red-700">
        {error}
      </div>
    );
  }
  if (groups === null) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando grupos…
      </div>
    );
  }
  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
        Nenhum grupo selecionado ainda. Vá na aba <b>WhatsApp</b>, escolha um número conectado e marque os grupos que ele deve enviar — cada grupo escolhido vira um card independente aqui.
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {groups.map((g) => (
          <GroupCard
            key={`${g.instanceId}:${g.groupId}`}
            item={g}
            channelId={channelId}
            onEdit={() => setEditing(g)}
            onViewProducts={() => setViewingProducts(g)}
            onToggled={reload}
          />
        ))}
      </div>


      <Dialog open={!!editing} onOpenChange={(v) => !v && (setEditing(null), reload())}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="border-b border-border/60 px-6 py-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Automação — {editing?.groupName ?? editing?.groupId ?? ""}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="px-6 py-5">
              <AutomationPanel
                key={`${channelId}:${editing.instanceId}:${editing.groupId}`}
                channelId={channelId}
                groupId={editing.groupId}
                groupName={editing.groupName}
                instanceId={editing.instanceId}
                instanceName={editing.instanceName}
                instancePhone={editing.instancePhone}
                instanceStatus={editing.instanceStatus}
                productTotal={editing.productTotal}
                bare
                onCancel={() => {
                  setEditing(null);
                  reload();
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ProductsDialog
        channelId={channelId}
        group={viewingProducts}
        onClose={() => setViewingProducts(null)}
      />
    </>
  );
}

function GroupCard({
  item,
  channelId,
  onEdit,
  onViewProducts,
  onToggled,
}: {
  item: AutomationGroupDTO;
  channelId: string;
  onEdit: () => void;
  onViewProducts: () => void;
  onToggled: () => void;
}) {
  const toggleFn = useServerFn(toggleGroupAutomation);
  const [busy, setBusy] = useState(false);
  const isRunning = item.automationStatus === "running" || item.automationStatus === "waiting";
  const isError = item.automationStatus === "error";
  const isConnected = item.instanceStatus === "connected";

  const statusLabel = (() => {
    switch (item.automationStatus) {
      case "running": return "Ativa";
      case "waiting": return "Aguardando janela";
      case "error": return "Erro";
      case "done": return "Concluída";
      case "idle": return "Pausada";
      default: return "Sem configuração";
    }
  })();

  const statusTone = isRunning
    ? "bg-emerald-500/15 text-emerald-700"
    : isError
    ? "bg-red-500/15 text-red-700"
    : "bg-muted text-muted-foreground";

  const doToggle = async () => {
    if (!item.configId) {
      onEdit();
      return;
    }
    setBusy(true);
    try {
      await toggleFn({
        data: { channelId, groupId: item.groupId, pause: isRunning },
      });
      onToggled();
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="grid grid-cols-1 items-center gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md lg:grid-cols-[minmax(220px,1.1fr)_minmax(220px,1.4fr)_auto_auto_auto]">
      {/* WhatsApp responsável */}
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600">
          <Smartphone className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold text-foreground">
            {item.instancePhone ?? item.instanceName ?? "Sem número"}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                isConnected
                  ? "bg-emerald-500/15 text-emerald-700"
                  : "bg-amber-500/15 text-amber-700"
              }`}
            >
              {isConnected ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              {isConnected ? "Conectado" : item.instanceStatus ?? "Offline"}
            </span>
            {item.instancePhone && (
              <span className="truncate text-[11px] text-muted-foreground">{item.instanceName}</span>
            )}
          </div>
        </div>
      </div>

      {/* Grupo vinculado */}
      <div className="flex min-w-0 items-center gap-3 border-t border-dashed border-border/70 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Users className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
            Grupo vinculado
          </p>
          <p className="truncate text-[13.5px] font-semibold text-foreground" title={item.groupName ?? item.groupId}>
            {item.groupName ?? item.groupId}
          </p>
        </div>
      </div>

      {/* Métricas */}
      <div className="flex items-center gap-5 lg:justify-center">
        <InlineMetric
          icon={<Package className="h-3.5 w-3.5" />}
          label="Produtos ativos"
          value={
            item.productTotal > item.productCount
              ? `${item.productCount} / ${item.productTotal}`
              : String(item.productCount)
          }
        />
        <InlineMetric icon={<Clock className="h-3.5 w-3.5" />} label="Último envio" value={formatRelative(item.lastSentAt)} />
      </div>


      {/* Status */}
      <div className="flex items-center lg:justify-center">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone}`}>
          {statusLabel}
        </span>
      </div>

      {/* Ações */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" /> Editar
        </Button>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onViewProducts}>
          <Eye className="h-3.5 w-3.5" /> Produtos
        </Button>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onEdit}>
          <Clock className="h-3.5 w-3.5" /> Horários
        </Button>
        <Button
          type="button"
          size="sm"
          variant={isRunning ? "secondary" : "default"}
          className="gap-1.5"
          onClick={doToggle}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isRunning ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {isRunning ? "Pausar" : "Retomar"}
        </Button>
      </div>
    </article>
  );
}

function InlineMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </p>
      <p className="mt-0.5 truncate text-[13px] font-semibold text-foreground">{value}</p>
    </div>
  );
}


function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </p>
      <p className="mt-0.5 truncate text-[13px] font-semibold text-foreground">{value}</p>
    </div>
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  const days = Math.round(h / 24);
  return `${days}d`;
}

function ProductsDialog({
  channelId,
  group,
  onClose,
}: {
  channelId: string;
  group: AutomationGroupDTO | null;
  onClose: () => void;
}) {
  const listFn = useServerFn(listGroupProducts);
  const [items, setItems] = useState<GroupProductDTO[] | null>(null);
  useEffect(() => {
    if (!group) {
      setItems(null);
      return;
    }
    let cancelled = false;
    setItems(null);
    listFn({ data: { channelId, groupJid: group.groupId } })
      .then((r) => !cancelled && setItems(r))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [group, channelId, listFn]);

  return (
    <Dialog open={!!group} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4" />
            Produtos — {group?.groupName ?? group?.groupId}
          </DialogTitle>
        </DialogHeader>
        {items === null ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando produtos…
          </div>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum produto capturado deste grupo ainda.
          </p>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {items.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-2.5">
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-muted">
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium text-foreground">{p.title}</p>
                  <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
                    {p.platform}
                    {p.promoPrice != null ? ` · R$ ${p.promoPrice.toFixed(2)}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    p.availability === "active"
                      ? "bg-emerald-500/15 text-emerald-700"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {p.availability === "active" ? "Ativo" : p.availability}
                </span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
