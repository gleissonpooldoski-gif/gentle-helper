import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, MessageCircle, Send, X, AlertTriangle, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sendWhatsAppProduct } from "@/modules/whatsapp/instances.functions";
import { useWhatsAppGroups } from "@/hooks/use-whatsapp-groups";

/**
 * Modal do botão verde "Grupos" do card de produto.
 *
 * Consome `useWhatsAppGroups(channelId)` — cache compartilhado da página.
 * Assim, abrir outro modal (outro produto) sempre exibe a mesma lista real
 * já carregada da Evolution, sem depender do estado local do primeiro modal.
 * O botão "Atualizar" força um refresh global que atualiza todos os modais
 * abertos simultaneamente.
 */

const DEFAULT_INSTANCE_NAME = "DIVULGA LINKS";

export interface SendProduct {
  title: string;
  link: string;
  price?: string | number | null;
  price_original?: string | number | null;
  image?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  product: SendProduct | null;
  channelId: string;
}

export function SendToGroupsModal({ open, onClose, product, channelId }: Props) {
  const sendFn = useServerFn(sendWhatsAppProduct);
  const { instance, groups, loading, error, refresh } = useWhatsAppGroups(channelId, open);

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const [presetKey, setPresetKey] = useState<string>("");

  // Cada abertura do modal recomeça a marcação (preset = grupos com selected=true).
  useEffect(() => {
    if (!open) return;
    setResult(null);
    const key = groups.map((g) => `${g.jid}:${g.selected ? 1 : 0}`).join("|");
    if (key !== presetKey) {
      const preset: Record<string, boolean> = {};
      groups.forEach((g) => {
        if (g.selected) preset[g.jid] = true;
      });
      setChecked(preset);
      setPresetKey(key);
    }
  }, [open, groups, presetKey]);

  // Ao fechar, reset do filtro para não vazar entre produtos.
  useEffect(() => {
    if (!open) {
      setFilter("");
      setPresetKey("");
    }
  }, [open]);

  if (!open) return null;

  const filtered = groups.filter((g) =>
    g.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const selectedJids = Object.entries(checked).filter(([, v]) => v).map(([k]) => k);
  const allVisibleChecked =
    filtered.length > 0 && filtered.every((g) => checked[g.jid]);
  const disconnected = instance !== null && instance.status !== "connected";

  const toggleAll = () => {
    const v = !allVisibleChecked;
    setChecked((prev) => {
      const next = { ...prev };
      filtered.forEach((g) => (next[g.jid] = v));
      return next;
    });
  };

  const handleSend = async () => {
    if (!instance || !product) return;
    if (disconnected) {
      toast.error("WhatsApp desconectado");
      return;
    }
    if (selectedJids.length === 0) {
      toast.error("Selecione ao menos um grupo");
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const res = await sendFn({
        data: {
          id: instance.id,
          channelId,
          jids: selectedJids,
          product: {
            title: product.title,
            link: product.link,
            price: product.price ?? null,
            price_original: product.price_original ?? null,
            image: product.image ?? null,
          },
        },
      });
      setResult({ sent: res.sent, failed: res.failed });
      if (res.sent > 0 && res.failed === 0) {
        toast.success(`Enviado para ${res.sent} grupo(s)`);
      } else if (res.sent > 0) {
        toast.warning(`Enviado: ${res.sent} · Falhas: ${res.failed}`);
      } else {
        toast.error("Nenhum envio concluído");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar");
    } finally {
      setSending(false);
    }
  };

  const initialLoading = loading && groups.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-border/70 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
              <MessageCircle className="h-4 w-4 text-[oklch(0.55_0.19_150)]" />
              Enviar para grupos
            </div>
            <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">
              {product?.title ?? ""}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Instância: <b className="text-foreground">{DEFAULT_INSTANCE_NAME}</b>
              {instance ? ` · status: ${instance.status}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {initialLoading ? (
          <div className="flex flex-1 items-center justify-center py-16 text-[12.5px] text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando grupos...
          </div>
        ) : error && groups.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <AlertTriangle className="h-6 w-6 text-[oklch(0.6_0.19_50)]" />
            <p className="text-[13px] font-semibold text-foreground">{error}</p>
            <p className="text-[12px] text-muted-foreground">
              Conecte {DEFAULT_INSTANCE_NAME} no painel para liberar o envio.
            </p>
            <Button variant="outline" size="sm" className="mt-2 gap-1.5" onClick={() => void refresh()}>
              <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
            </Button>
          </div>
        ) : (
          <>
            <div className="border-b border-border/70 px-5 py-3">
              <div className="flex items-center gap-2">
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filtrar grupos..."
                  className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-[12.5px] outline-none focus:border-primary"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5"
                  onClick={() => void refresh()}
                  disabled={loading}
                  title="Atualizar grupos"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                  Atualizar
                </Button>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11.5px] text-muted-foreground">
                <button
                  type="button"
                  onClick={toggleAll}
                  className="font-medium text-primary hover:underline"
                >
                  {allVisibleChecked ? "Desmarcar todos" : "Selecionar todos"}
                </button>
                <span>
                  {selectedJids.length} selecionado(s) · {groups.length} grupos
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2">
              {filtered.length === 0 ? (
                <p className="px-4 py-8 text-center text-[12px] text-muted-foreground">
                  Nenhum grupo encontrado.
                </p>
              ) : (
                filtered.map((g) => {
                  const on = !!checked[g.jid];
                  return (
                    <label
                      key={g.jid}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/60",
                        on && "bg-primary/5",
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-4 w-4 shrink-0 place-items-center rounded border",
                          on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                        )}
                      >
                        {on && <Check className="h-3 w-3" strokeWidth={4} />}
                      </span>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={on}
                        onChange={(e) =>
                          setChecked((prev) => ({ ...prev, [g.jid]: e.target.checked }))
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-foreground">
                          {g.name}
                        </p>
                        {g.participants != null && (
                          <p className="text-[11px] text-muted-foreground">
                            {g.participants} participantes
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            {result && (
              <div className="border-t border-border/70 bg-muted/30 px-5 py-3 text-[12.5px]">
                <div className="flex items-center gap-4">
                  <span className="text-[oklch(0.55_0.19_150)]">
                    ✅ Enviados: <b>{result.sent}</b>
                  </span>
                  <span className="text-[oklch(0.6_0.22_25)]">
                    ❌ Falharam: <b>{result.failed}</b>
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-border/70 px-5 py-3">
              <Button variant="outline" size="sm" onClick={onClose}>
                Fechar
              </Button>
              <Button
                size="sm"
                onClick={handleSend}
                disabled={sending || disconnected || selectedJids.length === 0}
                className="gap-1.5 bg-[oklch(0.62_0.19_150)] hover:bg-[oklch(0.55_0.19_150)]"
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                {sending ? "Enviando..." : "Enviar oferta"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
