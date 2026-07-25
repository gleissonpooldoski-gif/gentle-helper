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
  importAllEvolutionInstances,
  fetchWhatsAppGroups,
  saveWhatsAppGroupSelection,
  sendWhatsAppText,
  sendWhatsAppCampaign,
  type WhatsAppInstanceDTO,
  type WhatsAppGroupDTO,
} from "@/modules/whatsapp/instances.functions";
import { EvolutionSettingsCard } from "@/components/whatsapp/EvolutionSettingsCard";

interface Props {
  channelId: string;
}

type QrFlowState = "checking" | "connected" | "waiting_qr" | "error";

function normalizeQrSource(qrCode: string | null): string | null {
  if (!qrCode) return null;
  const value = qrCode.trim();
  if (!value) return null;
  return value.startsWith("data:") ? value : `data:image/png;base64,${value}`;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  creating: { label: "Criando…", cls: "bg-amber-100 text-amber-800" },
  awaiting_qr: { label: "Aguardando QR", cls: "bg-blue-100 text-blue-800" },
  connecting: { label: "Conectando…", cls: "bg-amber-100 text-amber-800" },
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
  const [qrFlowState, setQrFlowState] = useState<QrFlowState>("checking");
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

  useEffect(() => {
    setItems([]);
    setGroupsModal(null);
    setSendModal(null);
    setQrModal(null);
    setLoading(true);
    autoAdoptedRef.current = false;
  }, [channelId]);

  const reload = useCallback(async () => {
    try {
      const rows = await listFn({ data: { channelId } });
      setItems(rows);
      return rows;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar");
      return [] as WhatsAppInstanceDTO[];
    } finally {
      setLoading(false);
    }
  }, [listFn, channelId]);

  // Sempre consulta/adota "DIVULGA LINKS" ao abrir e força refresh ao vivo
  // (connectionState) de cada instância, para nunca exibir status cacheado do DB.
  const autoAdoptedRef = useRef(false);
  useEffect(() => {
    if (autoAdoptedRef.current) return;
    autoAdoptedRef.current = true;
    (async () => {
      try {
        await adoptFn({ data: { instanceName: "DIVULGA LINKS", channelId } });
      } catch {
        /* silencioso */
      }
      const rows = await reload();
      // Refresh ao vivo de todas as instâncias (força connectionState real).
      await Promise.all(
        rows.map((r) =>
          refreshFn({ data: { id: r.id } }).catch((err) => {
            console.warn("[WA] refresh live falhou:", err);
          }),
        ),
      );
      await reload();
    })();
  }, [reload, adoptFn, refreshFn, channelId]);

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

  // Máquina de estados:
  //   checking  → consultando connectionState
  //   connected → 🟢 WhatsApp conectado (não solicita QR)
  //   waiting_qr → QR válido renderizado
  //   error     → Evolution não devolveu QR
  const openQrModal = async (instance: WhatsAppInstanceDTO) => {
    setQrFlowState("checking");
    // 1) Primeiro verifica o estado remoto SEM criar/pedir QR.
    try {
      const st = await refreshFn({ data: { id: instance.id } });
      // eslint-disable-next-line no-console
      console.log("[WA] connectionState recebido:", st.status, "phone=", st.phone);
      if (st.status === "connected") {
        // Instância já está aberta — não abrir modal QR nem chamar connect/create.
        await reload();
        toast.success("🟢 WhatsApp conectado");
        return;
      }
      // 2) Desconectado → aí sim abre o modal para pedir QR.
      setQrModal(st);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[WA] connectionState falhou:", err);
      setQrFlowState("error");
      setQrModal(null);
      toast.error(
        err instanceof Error
          ? err.message
          : "Evolution API indisponível. Verifique o endereço público do serviço.",
      );
    }
  };

  // Ao abrir o modal (state != connected), solicita QR uma única vez e
  // faz polling curto por confirmação. Timeout máximo de 30s evita loading infinito.
  useEffect(() => {
    if (!qrModal) return;
    if (qrFlowState === "connected") return;

    let cancelled = false;
    let pollingId: ReturnType<typeof setInterval> | undefined;
    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      setQrFlowState((prev) => (prev === "waiting_qr" || prev === "checking" ? "error" : prev));
      if (pollingId) clearInterval(pollingId);
    }, 30_000);

    const poll = async () => {
      try {
        const upd = await refreshFn({ data: { id: qrModal.id } });
        if (cancelled) return;
        setQrModal(upd);
        // eslint-disable-next-line no-console
        console.log("[WA] poll connectionState:", upd.status, "qr?", !!upd.qrCode);
        if (upd.status === "connected") {
          setQrFlowState("connected");
          clearTimeout(timeoutId);
          if (pollingId) clearInterval(pollingId);
          toast.success("🟢 WhatsApp conectado");
        }
      } catch {
        /* silencioso; timeout resolverá */
      }
    };

    const bootstrap = async () => {
      try {
        const rc = await reconnectFn({ data: { id: qrModal.id } });
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.log("[WA] resposta do QR:", { status: rc.status, hasQr: !!rc.qrCode });
        setQrModal(rc);
        if (rc.status === "connected") {
          setQrFlowState("connected");
          clearTimeout(timeoutId);
          toast.success("🟢 WhatsApp conectado");
          return;
        }
        const qr = normalizeQrSource(rc.qrCode);
        // eslint-disable-next-line no-console
        console.log("[WA] campo base64 do QR:", qr ? "encontrado" : "AUSENTE");
        if (qr) {
          setQrFlowState("waiting_qr");
          pollingId = setInterval(poll, 3500);
        } else {
          setQrFlowState("error");
          clearTimeout(timeoutId);
          toast.error("Evolution não retornou QR Code. Verifique conexão da instância.");
        }
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error("[WA] erro ao solicitar QR:", err);
        setQrFlowState("error");
        clearTimeout(timeoutId);
        toast.error(err instanceof Error ? err.message : "Falha ao solicitar QR");
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      if (pollingId) clearInterval(pollingId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrModal?.id]);


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
      if (name.toUpperCase() === "DIVULGA LINKS") {
        await adoptFn({ data: { instanceName: "DIVULGA LINKS", channelId } });
        setModalOpen(false);
        setNewName("");
        toast.success("Instância existente conectada");
        await reload();
        return;
      }
      const created = await createFn({ data: { name, channelId } });
      setModalOpen(false);
      setNewName("");
      openQrModal(created);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar");
    } finally {
      setBusy(null);
    }
  };

  const handleReconnect = async (i: WhatsAppInstanceDTO) => {
    try {
      setBusy(`rec:${i.id}`);
      setQrFlowState("checking");
      setQrModal({ ...i, qrCode: null });

      // Só solicita QR se o estado remoto não for open.
      const st = await refreshFn({ data: { id: i.id } });
      // eslint-disable-next-line no-console
      console.log("[WA] connectionState recebido (reconnect):", st.status);
      if (st.status === "connected") {
        setQrModal(st);
        setQrFlowState("connected");
        toast.success("🟢 WhatsApp conectado");
        return;
      }

      const upd = await reconnectFn({ data: { id: i.id } });
      // eslint-disable-next-line no-console
      console.log("[WA] resposta do QR (reconnect):", { status: upd.status, hasQr: !!upd.qrCode });
      const qrValue = normalizeQrSource(upd.qrCode);
      // eslint-disable-next-line no-console
      console.log("[WA] campo base64 do QR (reconnect):", qrValue ? "encontrado" : "AUSENTE");

      if (upd.status === "connected") {
        setQrModal(upd);
        setQrFlowState("connected");
        toast.success("🟢 WhatsApp conectado");
        return;
      }
      setQrModal(upd);
      if (qrValue) {
        setQrFlowState("waiting_qr");
      } else {
        setQrFlowState("error");
        toast.error("Evolution não retornou QR Code. Verifique conexão da instância.");
      }
    } catch (err) {
      setQrFlowState("error");
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
      const gs = await groupsFn({ data: { id: i.id, channelId } });
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
      await saveGroupsFn({ data: { id: groupsModal.inst.id, channelId, groups: chosen } });
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
        <EvolutionSettingsCard />
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
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          setBusy(`ref:${i.id}`);
                          const upd = await refreshFn({ data: { id: i.id } });
                          await reload();
                          if (upd.status === "connected") toast.success("🟢 WhatsApp conectado");
                          else if (upd.status === "connecting") toast.message("Conectando…");
                          else if (upd.status === "disconnected") toast.message("Desconectado");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Falha ao atualizar");
                        } finally {
                          setBusy(null);
                        }
                      }}
                      disabled={busy === `ref:${i.id}`}
                      title="Atualizar status"
                    >
                      {busy === `ref:${i.id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                    {i.status === "awaiting_qr" && (
                      <Button size="sm" variant="outline" onClick={() => openQrModal(i)}>
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
                  {qrFlowState === "connected" ? (
                    <div className="flex h-[260px] w-[260px] flex-col items-center justify-center gap-2 text-emerald-600">
                      <CheckCircle2 className="h-12 w-12" />
                      <p className="text-sm font-semibold">🟢 WhatsApp conectado</p>
                    </div>
                  ) : qrFlowState === "waiting_qr" && normalizeQrSource(qrModal.qrCode) ? (
                    <img
                      src={normalizeQrSource(qrModal.qrCode) ?? undefined}
                      alt="QR Code WhatsApp"
                      width={260}
                      height={260}
                    />
                  ) : qrFlowState === "error" ? (
                    <div className="flex h-[260px] w-[260px] flex-col items-center justify-center gap-3 p-4 text-center">
                      <p className="text-xs text-muted-foreground">
                        Não foi possível obter um QR válido. Verifique se a Evolution API está acessível e tente novamente.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReconnect(qrModal)}
                      >
                        <RefreshCw className="mr-1 h-4 w-4" /> Tentar novamente
                      </Button>
                    </div>

                  ) : qrFlowState === "checking" ? (
                    <div className="flex h-[260px] w-[260px] flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <p className="text-xs">Verificando conexão…</p>
                    </div>
                  ) : (
                    <div className="flex h-[260px] w-[260px] flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <p className="text-xs">Aguardando QR Code…</p>
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
                {qrFlowState === "waiting_qr" && qrModal.qrCode && (
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
                {qrFlowState === "connected" ? "Concluir" : "Fechar"}
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
