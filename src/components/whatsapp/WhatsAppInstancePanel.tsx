import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Plus,
  Loader2,
  RefreshCw,
  Power,
  Trash2,
  QrCode,
  CheckCircle2,
  X,
  Smartphone,
  Users,
  Send,
  Download,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  listWhatsAppInstances,
  createWhatsAppInstance,
  refreshWhatsAppInstance,
  reconnectWhatsAppInstance,
  disconnectWhatsAppInstance,
  deleteWhatsAppInstance,
  adoptEvolutionInstance,
  fetchWhatsAppGroups,
  saveWhatsAppGroupSelection,
  sendWhatsAppText,
  sendWhatsAppCampaign,
  type WhatsAppInstanceDTO,
  type WhatsAppGroupDTO,
} from "@/modules/whatsapp/instances.functions";

interface Props {
  channelId?: string;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  creating: { label: "Criando…", cls: "bg-amber-100 text-amber-800" },
  awaiting_qr: { label: "Aguardando QR", cls: "bg-blue-100 text-blue-800" },
  connected: { label: "Conectado", cls: "bg-emerald-100 text-emerald-800" },
  disconnected: { label: "Desconectado", cls: "bg-muted text-muted-foreground" },
  error: { label: "Erro", cls: "bg-red-100 text-red-800" },
};

export function WhatsAppInstancePanel({ channelId }: Props) {
  const listFn = useServerFn(listWhatsAppInstances);
  const createFn = useServerFn(createWhatsAppInstance);
  const refreshFn = useServerFn(refreshWhatsAppInstance);
  const reconnectFn = useServerFn(reconnectWhatsAppInstance);
  const disconnectFn = useServerFn(disconnectWhatsAppInstance);
  const deleteFn = useServerFn(deleteWhatsAppInstance);

  const adoptFn = useServerFn(adoptEvolutionInstance);
  const groupsFn = useServerFn(fetchWhatsAppGroups);
  const saveGroupsFn = useServerFn(saveWhatsAppGroupSelection);
  const sendTextFn = useServerFn(sendWhatsAppText);
  const sendCampaignFn = useServerFn(sendWhatsAppCampaign);

  const [items, setItems] = useState<WhatsAppInstanceDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [qrModal, setQrModal] = useState<WhatsAppInstanceDTO | null>(null);
  const [adoptOpen, setAdoptOpen] = useState(false);
  const [adoptName, setAdoptName] = useState("");
  const [groupsModal, setGroupsModal] = useState<{
    inst: WhatsAppInstanceDTO;
    groups: WhatsAppGroupDTO[];
    loading: boolean;
    filter: string;
  } | null>(null);
  const [sendModal, setSendModal] = useState<{
    inst: WhatsAppInstanceDTO;
    text: string;
    jid: string;
    mode: "test" | "campaign";
  } | null>(null);

  const reload = useCallback(async () => {
    try {
      const rows = await listFn({ data: channelId ? { channelId } : {} });
      setItems(rows);
      return rows;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar");
      return [] as WhatsAppInstanceDTO[];
    } finally {
      setLoading(false);
    }
  }, [listFn, channelId]);

  // Auto-adota "DIVULGA LINKS" se ainda não estiver registrada localmente.
  // Evita chamar POST /instance/create (que retorna 403 code 1003 se já existir na Evolution).
  const autoAdoptedRef = useRef(false);
  useEffect(() => {
    if (autoAdoptedRef.current) return;
    autoAdoptedRef.current = true;
    (async () => {
      const rows = await reload();
      const has = rows.some(
        (r) => r.instanceName.trim().toLowerCase() === "divulga links",
      );
      if (!has) {
        try {
          await adoptFn({ data: { instanceName: "DIVULGA LINKS", channelId } });
          await reload();
        } catch {
          /* silencioso: se não existir na Evolution, usuário cria manualmente */
        }
      }
    })();
  }, [reload, adoptFn, channelId]);

  // Realtime: refresh automático via postgres_changes
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      const channel = supabase
        .channel(`wa-instances-${uid}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "whatsapp_instances",
            filter: `user_id=eq.${uid}`,
          },
          () => reloadRef.current(),
        )
        .subscribe();
      cleanup = () => {
        supabase.removeChannel(channel);
      };
    })();
    return () => cleanup?.();
  }, []);

  // Timeout para gerar QR (30s) — evita loading infinito
  const [qrTimedOut, setQrTimedOut] = useState(false);
  const qrOpenedAtRef = useRef<number | null>(null);

  // Se o QR modal está aberto, faz polling do status
  useEffect(() => {
    if (!qrModal) {
      qrOpenedAtRef.current = null;
      setQrTimedOut(false);
      return;
    }
    if (qrOpenedAtRef.current == null) qrOpenedAtRef.current = Date.now();
    // Se já está conectado ao abrir, não faz polling.
    if (qrModal.status === "connected") return;

    let cancelled = false;
    const tick = async () => {
      try {
        const upd = await refreshFn({ data: { id: qrModal.id } });
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.log("Evolution status", upd.status, "QR?", !!upd.qrCode);
        setQrModal(upd);
        if (upd.status === "connected") {
          toast.success("WhatsApp conectado!");
          return;
        }
        if (
          !upd.qrCode &&
          qrOpenedAtRef.current &&
          Date.now() - qrOpenedAtRef.current > 30_000
        ) {
          setQrTimedOut(true);
        }
      } catch {
        /* ignore transient */
      }
    };
    const id = setInterval(tick, 3500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [qrModal?.id, qrModal?.status, refreshFn]);

  // Mantém dados do modal sincronizados com a lista
  useEffect(() => {
    if (!qrModal) return;
    const fresh = items.find((i) => i.id === qrModal.id);
    if (fresh) setQrModal(fresh);
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      setBusy("create");
      const created = await createFn({ data: { name, channelId } });
      setModalOpen(false);
      setNewName("");
      setQrModal(created);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar");
    } finally {
      setBusy(null);
    }
  };

  const handleReconnect = async (i: WhatsAppInstanceDTO) => {
    // Se já está conectado, não pede QR novo.
    if (i.status === "connected") {
      toast.success("WhatsApp já conectado");
      return;
    }
    try {
      setBusy(`rec:${i.id}`);
      setQrTimedOut(false);
      qrOpenedAtRef.current = Date.now();
      const upd = await reconnectFn({ data: { id: i.id } });
      setQrModal(upd);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao reconectar");
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnect = async (i: WhatsAppInstanceDTO) => {
    if (!confirm(`Desconectar "${i.instanceName}"?`)) return;
    try {
      setBusy(`dis:${i.id}`);
      await disconnectFn({ data: { id: i.id } });
      toast.success("Sessão desconectada");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao desconectar");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (i: WhatsAppInstanceDTO) => {
    if (!confirm(`Excluir instância "${i.instanceName}"? Esta ação é irreversível.`)) return;
    try {
      setBusy(`del:${i.id}`);
      await deleteFn({ data: { id: i.id } });
      toast.success("Instância removida");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir");
    } finally {
      setBusy(null);
    }
  };

  const handleAdopt = async () => {
    const name = adoptName.trim();
    if (!name) return;
    try {
      setBusy("adopt");
      await adoptFn({ data: { instanceName: name, channelId } });
      toast.success("Instância importada");
      setAdoptOpen(false);
      setAdoptName("");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao importar");
    } finally {
      setBusy(null);
    }
  };

  const openGroups = async (i: WhatsAppInstanceDTO) => {
    setGroupsModal({ inst: i, groups: [], loading: true, filter: "" });
    try {
      const gs = await groupsFn({ data: { id: i.id } });
      setGroupsModal((m) => (m ? { ...m, groups: gs, loading: false } : m));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao buscar grupos");
      setGroupsModal(null);
    }
  };

  const toggleGroup = (jid: string) => {
    setGroupsModal((m) =>
      m
        ? {
            ...m,
            groups: m.groups.map((g) => (g.jid === jid ? { ...g, selected: !g.selected } : g)),
          }
        : m,
    );
  };

  const saveGroups = async () => {
    if (!groupsModal) return;
    try {
      setBusy("groups:save");
      const chosen = groupsModal.groups
        .filter((g) => g.selected)
        .map((g) => ({ jid: g.jid, name: g.name }));
      await saveGroupsFn({ data: { id: groupsModal.inst.id, groups: chosen } });
      toast.success(`${chosen.length} grupo(s) salvo(s)`);
      setGroupsModal(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setBusy(null);
    }
  };

  const handleSend = async () => {
    if (!sendModal) return;
    try {
      setBusy("send");
      if (sendModal.mode === "test") {
        if (!sendModal.jid.trim()) {
          toast.error("Informe número ou JID de destino");
          return;
        }
        await sendTextFn({
          data: { id: sendModal.inst.id, jid: sendModal.jid.trim(), text: sendModal.text },
        });
        toast.success("Mensagem enviada");
      } else {
        const res = await sendCampaignFn({
          data: { id: sendModal.inst.id, text: sendModal.text },
        });
        toast.success(`Campanha: ${res.sent} enviada(s), ${res.failed} falha(s)`);
      }
      setSendModal(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border/70 bg-gradient-to-r from-emerald-600 to-emerald-700 px-5 py-4 text-white">
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5" />
          <h3 className="text-base font-semibold">WhatsApp — Instâncias</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setAdoptOpen(true)}
            className="bg-white/10 text-white ring-1 ring-white/30 hover:bg-white/20"
          >
            <Download className="mr-1 h-4 w-4" /> Importar existente
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setModalOpen(true)}
            className="bg-white text-emerald-700 hover:bg-white/90"
          >
            <Plus className="mr-1 h-4 w-4" /> Conectar novo número
          </Button>
        </div>
      </div>

      <div className="p-5">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum número conectado. Clique em <b>Conectar novo número</b> para começar.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((i) => {
              const s = STATUS_LABEL[i.status] ?? STATUS_LABEL.disconnected;
              return (
                <li
                  key={i.id}
                  className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{i.instanceName}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.phone ?? "Sem número"} · atualizado{" "}
                      {new Date(i.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.cls}`}
                    >
                      {s.label}
                    </span>
                    {i.status === "awaiting_qr" && (
                      <Button size="sm" variant="outline" onClick={() => setQrModal(i)}>
                        <QrCode className="mr-1 h-4 w-4" /> Ver QR
                      </Button>
                    )}
                    {i.status !== "connected" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReconnect(i)}
                        disabled={busy === `rec:${i.id}`}
                      >
                        {busy === `rec:${i.id}` ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-1 h-4 w-4" />
                        )}
                        Reconectar
                      </Button>
                    )}
                    {i.status === "connected" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => openGroups(i)}>
                          <Users className="mr-1 h-4 w-4" /> Grupos
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setSendModal({ inst: i, text: "", jid: "", mode: "test" })
                          }
                        >
                          <Send className="mr-1 h-4 w-4" /> Enviar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDisconnect(i)}
                          disabled={busy === `dis:${i.id}`}
                        >
                          <Power className="mr-1 h-4 w-4" /> Desconectar
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(i)}
                      disabled={busy === `del:${i.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Modal criar */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !busy && setModalOpen(false)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between bg-emerald-700 px-5 py-4 text-white">
              <h4 className="font-semibold">Conectar novo número</h4>
              <button onClick={() => !busy && setModalOpen(false)} aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-6">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Nome da sessão *
              </label>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="Ex: Promos"
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>
            <div className="border-t border-border bg-muted/30 px-5 py-4">
              <Button
                onClick={handleCreate}
                disabled={busy === "create" || !newName.trim()}
                className="h-11 w-full bg-emerald-600 hover:bg-emerald-700"
              >
                {busy === "create" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <QrCode className="mr-2 h-4 w-4" />
                )}
                Gerar QR Code
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal QR */}
      {qrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setQrModal(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between bg-emerald-700 px-5 py-4 text-white">
              <h4 className="font-semibold">{qrModal.instanceName}</h4>
              <button onClick={() => setQrModal(null)} aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-6">
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-xl border border-border bg-white p-3 shadow-sm">
                  {qrModal.status === "connected" ? (
                    <div className="flex h-[260px] w-[260px] flex-col items-center justify-center gap-2 text-emerald-600">
                      <CheckCircle2 className="h-12 w-12" />
                      <p className="text-sm font-semibold">Conectado</p>
                    </div>
                  ) : qrModal.qrCode && /^(data:image|[A-Za-z0-9+/=]{100,})/.test(qrModal.qrCode) ? (
                    <img
                      src={
                        qrModal.qrCode.startsWith("data:")
                          ? qrModal.qrCode
                          : `data:image/png;base64,${qrModal.qrCode}`
                      }
                      alt="QR Code WhatsApp"
                      width={260}
                      height={260}
                    />
                  ) : qrModal.qrCode ? (
                    <div className="flex h-[260px] w-[260px] items-center justify-center break-all p-4 text-center font-mono text-xs">
                      {qrModal.qrCode}
                    </div>
                  ) : (
                    <div className="flex h-[260px] w-[260px] flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <p className="text-xs">
                        {qrModal.status === "creating"
                          ? "Criando instância…"
                          : "Aguardando QR Code…"}
                      </p>
                    </div>
                  )}
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
                    (STATUS_LABEL[qrModal.status] ?? STATUS_LABEL.disconnected).cls
                  }`}
                >
                  {(STATUS_LABEL[qrModal.status] ?? STATUS_LABEL.disconnected).label}
                </span>
                {qrModal.status !== "connected" && (
                  <p className="text-center text-xs text-muted-foreground">
                    Abra o WhatsApp no celular → Aparelhos conectados → Conectar um aparelho e
                    escaneie o QR Code acima.
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2 border-t border-border bg-muted/30 px-5 py-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => handleReconnect(qrModal)}
                disabled={busy === `rec:${qrModal.id}`}
              >
                {busy === `rec:${qrModal.id}` ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Novo QR
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setQrModal(null)}
              >
                {qrModal.status === "connected" ? "Concluir" : "Fechar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Importar existente */}
      {adoptOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !busy && setAdoptOpen(false)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between bg-emerald-700 px-5 py-4 text-white">
              <h4 className="font-semibold">Importar instância existente</h4>
              <button onClick={() => !busy && setAdoptOpen(false)} aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-6">
              <p className="text-xs text-muted-foreground">
                Informe o nome exato da instância já criada na Evolution API (ex:{" "}
                <b>DIVULGA LINKS</b>).
              </p>
              <input
                autoFocus
                value={adoptName}
                onChange={(e) => setAdoptName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdopt()}
                placeholder="Nome da instância"
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>
            <div className="border-t border-border bg-muted/30 px-5 py-4">
              <Button
                onClick={handleAdopt}
                disabled={busy === "adopt" || !adoptName.trim()}
                className="h-11 w-full bg-emerald-600 hover:bg-emerald-700"
              >
                {busy === "adopt" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Importar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Grupos */}
      {groupsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !busy && setGroupsModal(null)}
        >
          <div
            className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-card shadow-2xl"
            style={{ maxHeight: "85vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between bg-emerald-700 px-5 py-4 text-white">
              <h4 className="font-semibold">Grupos — {groupsModal.inst.instanceName}</h4>
              <button onClick={() => setGroupsModal(null)} aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="border-b border-border px-5 py-3">
              <input
                value={groupsModal.filter}
                onChange={(e) =>
                  setGroupsModal((m) => (m ? { ...m, filter: e.target.value } : m))
                }
                placeholder="Filtrar grupos…"
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {groupsModal.loading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando grupos…
                </div>
              ) : groupsModal.groups.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum grupo encontrado.
                </p>
              ) : (
                <ul className="space-y-1">
                  {groupsModal.groups
                    .filter((g) =>
                      g.name.toLowerCase().includes(groupsModal.filter.toLowerCase()),
                    )
                    .map((g) => (
                      <li key={g.jid}>
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50">
                          <input
                            type="checkbox"
                            checked={g.selected}
                            onChange={() => toggleGroup(g.jid)}
                            className="h-4 w-4 accent-emerald-600"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{g.name}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {g.participants ? `${g.participants} membros` : g.jid}
                            </p>
                          </div>
                        </label>
                      </li>
                    ))}
                </ul>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-5 py-4">
              <span className="text-xs text-muted-foreground">
                {groupsModal.groups.filter((g) => g.selected).length} selecionado(s)
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setGroupsModal(null)}>
                  Cancelar
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={saveGroups}
                  disabled={busy === "groups:save"}
                >
                  {busy === "groups:save" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar seleção
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Enviar */}
      {sendModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !busy && setSendModal(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between bg-emerald-700 px-5 py-4 text-white">
              <h4 className="font-semibold">Enviar mensagem</h4>
              <button onClick={() => setSendModal(null)} aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-6">
              <div className="flex gap-2 rounded-lg bg-muted p-1 text-xs font-semibold">
                <button
                  onClick={() => setSendModal((m) => (m ? { ...m, mode: "test" } : m))}
                  className={`flex-1 rounded-md px-3 py-1.5 ${sendModal.mode === "test" ? "bg-background shadow" : "text-muted-foreground"}`}
                >
                  Teste (1 destino)
                </button>
                <button
                  onClick={() => setSendModal((m) => (m ? { ...m, mode: "campaign" } : m))}
                  className={`flex-1 rounded-md px-3 py-1.5 ${sendModal.mode === "campaign" ? "bg-background shadow" : "text-muted-foreground"}`}
                >
                  Campanha (grupos salvos)
                </button>
              </div>
              {sendModal.mode === "test" && (
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Número (5511...) ou JID
                  </label>
                  <input
                    value={sendModal.jid}
                    onChange={(e) =>
                      setSendModal((m) => (m ? { ...m, jid: e.target.value } : m))
                    }
                    placeholder="55119XXXXXXXX ou 5511...@g.us"
                    className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                  />
                </div>
              )}
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Mensagem
                </label>
                <textarea
                  value={sendModal.text}
                  onChange={(e) =>
                    setSendModal((m) => (m ? { ...m, text: e.target.value } : m))
                  }
                  rows={5}
                  placeholder="Digite sua mensagem…"
                  className="mt-1 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                />
              </div>
            </div>
            <div className="flex gap-2 border-t border-border bg-muted/30 px-5 py-4">
              <Button variant="outline" className="flex-1" onClick={() => setSendModal(null)}>
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                onClick={handleSend}
                disabled={busy === "send" || !sendModal.text.trim()}
              >
                {busy === "send" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Enviar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
