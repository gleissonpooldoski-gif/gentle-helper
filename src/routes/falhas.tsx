import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw, Check } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import {
  listAutomationFailures,
  resolveFailure,
  retryFailure,
  type FailureRow,
} from "@/modules/dlq/dlq.functions";
import { useState } from "react";

export const Route = createFileRoute("/falhas")({
  head: () => ({
    meta: [
      { title: "Falhas de Envio | DivulgaLinks" },
      { name: "description", content: "Dead-Letter Queue: mensagens que falharam ao enviar." },
    ],
  }),
  component: FailuresPage,
});

function FailuresPage() {
  const listFn = useServerFn(listAutomationFailures);
  const resolveFn = useServerFn(resolveFailure);
  const retryFn = useServerFn(retryFailure);
  const [includeResolved, setIncludeResolved] = useState(false);

  const q = useQuery({
    queryKey: ["automation-failures", includeResolved],
    queryFn: () => listFn({ data: { includeResolved } }),
    refetchInterval: 30_000,
  });

  const resolveMut = useMutation({
    mutationFn: (id: string) => resolveFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Falha marcada como resolvida");
      q.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const retryMut = useMutation({
    mutationFn: (id: string) => retryFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Reprocessamento agendado — o próximo tick vai executar");
      q.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = q.data ?? [];

  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased lg:flex">
      <AppSidebar />
      <div className="flex-1 lg:min-w-0">
        <main className="mx-auto w-full max-w-[1200px] px-4 pb-24 pt-6 sm:px-6 lg:px-8">
          <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
                <AlertTriangle className="h-6 w-6 text-destructive" />
                Falhas de Envio
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Mensagens que a automação não conseguiu entregar. Clique em
                Reprocessar para tentar novamente no próximo ciclo.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={includeResolved}
                onChange={(e) => setIncludeResolved(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Mostrar resolvidas
            </label>
          </header>

          {q.isLoading && (
            <div className="rounded-2xl border border-border/70 bg-card p-8 text-center text-muted-foreground">
              Carregando falhas…
            </div>
          )}

          {!q.isLoading && rows.length === 0 && (
            <div className="rounded-2xl border border-border/70 bg-card p-8 text-center">
              <Check className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
              <p className="font-medium text-foreground">Nenhuma falha pendente 🎉</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Todos os envios estão saindo sem erros.
              </p>
            </div>
          )}

          {rows.length > 0 && (
            <div className="space-y-3">
              {rows.map((r: FailureRow) => (
                <div
                  key={r.id}
                  className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">
                        {r.product_title ?? r.product_id ?? "Produto removido"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString("pt-BR")} · Grupo{" "}
                        <span className="font-mono">{r.group_id ?? "—"}</span> ·{" "}
                        {r.attempt_count} tentativa(s)
                      </p>
                      <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {r.error_message}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {!r.resolved_at && (
                        <>
                          <button
                            type="button"
                            onClick={() => retryMut.mutate(r.id)}
                            disabled={retryMut.isPending}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Reprocessar
                          </button>
                          <button
                            type="button"
                            onClick={() => resolveMut.mutate(r.id)}
                            disabled={resolveMut.isPending}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Resolver
                          </button>
                        </>
                      )}
                      {r.resolved_at && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600">
                          <Check className="h-3 w-3" />
                          Resolvida
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
