import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getInstagramDiagnostics } from "@/modules/instagram-admin/admin.functions";
import { InstagramLayout } from "./instagram";
import { Loader2 } from "lucide-react";

function Row({ label, ok, extra }: { label: string; ok: boolean; extra?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/40 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">
        {ok ? "🟢" : "🔴"} {extra ?? (ok ? "OK" : "Falha")}
      </span>
    </div>
  );
}

function fmt(dt: string | null | undefined) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("pt-BR");
}

function Page() {
  const load = useServerFn(getInstagramDiagnostics);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["ig-admin", "diagnostics"],
    queryFn: () => load(),
    refetchInterval: 30_000,
  });

  return (
    <InstagramLayout>
      <div className="max-w-2xl space-y-4 rounded-2xl border border-border/70 bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Diagnóstico</h2>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-1.5 text-sm hover:bg-muted"
          >
            {isFetching && <Loader2 className="h-4 w-4 animate-spin" />}
            Atualizar
          </button>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Verificando…
          </div>
        ) : !data?.configured ? (
          <p className="text-sm text-muted-foreground">
            Conta ainda não configurada. Vá em Configurações.
          </p>
        ) : (
          <div className="space-y-1">
            <Row
              label="Instagram conectado"
              ok={!!data.info?.username}
              extra={data.info?.username ? `@${data.info.username}` : data.error ?? "sem"}
            />
            <Row
              label="Facebook Page"
              ok={!!data.info?.pageName}
              extra={data.info?.pageName ?? "—"}
            />
            <Row label="Webhook" ok={!!data.info?.webhookActive} />
            <Row label="Stories" ok={!!data.info?.capabilities?.stories} />
            <Row label="Comentários" ok={!!data.info?.capabilities?.comments} />
            <Row label="Mensagens" ok={!!data.info?.capabilities?.messages} />
            <Row label="Último Story" ok={!!data.lastStoryAt} extra={fmt(data.lastStoryAt)} />
            <Row label="Última DM automática" ok={!!data.lastDmAt} extra={fmt(data.lastDmAt)} />
            <Row label="Último comentário respondido" ok={!!data.lastCommentAt} extra={fmt(data.lastCommentAt)} />
            <Row label="Instagram Business ID" ok={!!data.businessId} extra={data.businessId} />
            <Row label="Facebook Page ID" ok={!!data.pageId} extra={data.pageId} />
          </div>
        )}
      </div>
    </InstagramLayout>
  );
}

export const Route = createFileRoute("/instagram/diagnostico")({
  head: () => ({
    meta: [
      { title: "Diagnóstico Instagram · DivulgaLinks" },
      { name: "description", content: "Verificação em tempo real de conexão, permissões e webhooks." },
    ],
  }),
  component: Page,
});
