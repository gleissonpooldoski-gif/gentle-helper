import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ConnectNewNumberModal, type CreatedSession } from "@/components/whatsapp/ConnectNewNumberModal";
import {
  listWhatsAppSessions,
  createWhatsAppSession,
  deleteWhatsAppSession,
  confirmWhatsAppSession,
  type WASessionDTO,
} from "@/modules/channels/whatsapp/sessions.functions";

export const Route = createFileRoute("/configuracoes/sessoes-whatsapp")({
  head: () => ({
    meta: [
      { title: "Sessões WhatsApp — Configurações" },
      { name: "description", content: "Gerencie suas sessões WhatsApp reutilizáveis." },
      { property: "og:title", content: "Sessões WhatsApp" },
      { property: "og:description", content: "Gerencie suas sessões WhatsApp reutilizáveis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SessionsPage,
});

function SessionsPage() {
  const listFn = useServerFn(listWhatsAppSessions);
  const createFn = useServerFn(createWhatsAppSession);
  const deleteFn = useServerFn(deleteWhatsAppSession);
  const confirmFn = useServerFn(confirmWhatsAppSession);

  const [sessions, setSessions] = useState<WASessionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);


  const reload = useCallback(async () => {
    try {
      setSessions(await listFn());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar sessões");
    } finally {
      setLoading(false);
    }
  }, [listFn]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Realtime: refresh on any change to whatsapp_sessions for the current user
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || cancelled) return;
      const channel = supabase
        .channel(`wa-sessions-${uid}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "whatsapp_sessions", filter: `user_id=eq.${uid}` },
          () => reloadRef.current(),
        )
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreate = async ({ name }: { name: string }): Promise<CreatedSession> => {
    const s = await createFn({ data: { name } });
    // Refresh the list so the pending session appears immediately.
    reload();
    return {
      id: s.id,
      name: s.name,
      sessionKey: s.sessionKey,
      expiresAt: s.expiresAt,
    };
  };



  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta sessão?")) return;
    try {
      setBusy(`del:${id}`);
      await deleteFn({ data: { sessionId: id } });
      toast.success("Sessão excluída");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir");
    } finally {
      setBusy(null);
    }
  };

  const handleConfirm = async (id: string) => {
    try {
      setBusy(`conf:${id}`);
      await confirmFn({ data: { sessionId: id } });
      toast.success("Sessão marcada como conectada");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Sessões WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie os números WhatsApp que podem ser vinculados aos seus canais.
        </p>
      </header>

      <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-card p-4">
        <p className="text-sm text-muted-foreground">
          {sessions.length} sessão(ões) cadastrada(s)
        </p>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Nova sessão
        </Button>
      </div>


      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma sessão criada ainda.</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  {s.phoneNumber ?? "Número não informado"} · {s.linkedChannels} canais vinculados
                </p>
                <p className="text-xs text-muted-foreground">
                  Última conexão:{" "}
                  {s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleString() : "nunca"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    s.status === "connected"
                      ? "bg-[oklch(0.94_0.08_150)] text-[oklch(0.42_0.15_155)]"
                      : s.status === "pending"
                        ? "bg-[oklch(0.94_0.09_75)] text-[oklch(0.42_0.15_60)]"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {s.status}
                </span>
                {s.status !== "connected" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleConfirm(s.id)}
                    disabled={busy === `conf:${s.id}`}
                  >
                    Marcar conectada
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDelete(s.id)}
                  disabled={busy === `del:${s.id}`}
                >
                  Excluir
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConnectNewNumberModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreate}
        onConnected={() => {
          toast.success("WhatsApp conectado");
          reload();
        }}
      />
    </div>
  );
}
