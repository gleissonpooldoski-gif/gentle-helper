import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { RefreshCcw, RotateCcw, Send } from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  listWhatsAppSendHistory,
  resendWhatsAppSend,
  type SendHistoryRow,
} from "@/modules/whatsapp/history.functions";

export const Route = createFileRoute("/configuracoes/envios-whatsapp")({
  head: () => ({
    meta: [
      { title: "Envios WhatsApp · DivulgaLinks" },
      { name: "description", content: "Histórico de envios WhatsApp com reenvio manual dos que falharam." },
      { property: "og:title", content: "Envios WhatsApp · DivulgaLinks" },
      { property: "og:description", content: "Histórico e reenvio de mensagens WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SendHistoryPage,
});

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function SendHistoryPage() {
  const [filter, setFilter] = useState<"all" | "sent" | "failed">("failed");
  const listFn = useServerFn(listWhatsAppSendHistory);
  const resendFn = useServerFn(resendWhatsAppSend);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["wa-history", filter],
    queryFn: () => listFn({ data: { status: filter, limit: 100 } }),
  });

  const resend = useMutation({
    mutationFn: (id: string) => resendFn({ data: { historyId: id } }),
    onSuccess: () => {
      toast.success("Mensagem reenviada");
      qc.invalidateQueries({ queryKey: ["wa-history"] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao reenviar"),
  });

  const rows = q.data ?? [];

  return (
    <div className="min-h-screen bg-background font-sans text-foreground lg:flex">
      <AppSidebar activeId="envios-whatsapp" />
      <div className="flex-1 lg:min-w-0">
        <main className="mx-auto w-full max-w-[1200px] px-4 pb-24 pt-10 sm:px-6 lg:px-10">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">Envios WhatsApp</h1>
              <p className="text-sm text-muted-foreground">
                Histórico dos disparos automáticos e manuais. Reenvie os que falharam.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                <SelectTrigger className="h-9 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="failed">Só falhados</SelectItem>
                  <SelectItem value="sent">Só enviados</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
                <RefreshCcw className={cn("mr-1.5 h-4 w-4", q.isFetching && "animate-spin")} />
                Atualizar
              </Button>
            </div>
          </header>

          <section className="overflow-hidden rounded-2xl border border-border/70 bg-card">
            {q.isLoading ? (
              <p className="p-8 text-center text-sm text-muted-foreground">Carregando…</p>
            ) : rows.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Nenhum envio {filter === "failed" ? "falhado" : filter === "sent" ? "enviado" : ""} encontrado.
              </p>
            ) : (
              <ul className="divide-y divide-border/70">
                {rows.map((r: SendHistoryRow) => (
                  <li key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    {r.media_url ? (
                      <img
                        src={r.media_url}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-lg border border-border/60 object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                        <Send className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {r.product_title ?? "(sem produto)"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {r.instance_name ?? "(instância removida)"} → <span className="font-mono">{r.jid}</span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{fmtDate(r.sent_at)}</p>
                      {r.error && (
                        <p className="mt-1 line-clamp-2 text-[11px] text-[color:var(--color-danger)]">
                          {r.error}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                          r.status === "sent"
                            ? "bg-[oklch(0.94_0.08_150)] text-[oklch(0.42_0.15_155)]"
                            : "bg-[oklch(0.95_0.06_25)] text-[oklch(0.5_0.2_25)]",
                        )}
                      >
                        {r.status}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resend.mutate(r.id)}
                        disabled={resend.isPending}
                      >
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                        Reenviar
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
