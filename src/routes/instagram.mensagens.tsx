import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listInstagramAdminConversations } from "@/modules/instagram-admin/admin.functions";
import { InstagramLayout } from "./instagram";
import { Loader2 } from "lucide-react";

function Page() {
  const list = useServerFn(listInstagramAdminConversations);
  const { data, isLoading } = useQuery({
    queryKey: ["ig-admin", "conversations"],
    queryFn: () => list(),
  });

  const err = (data as any)?.error;
  const conversations = Array.isArray(data) ? data : [];

  return (
    <InstagramLayout>
      <div className="rounded-2xl border border-border/70 bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Mensagens (DM)</h2>
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        )}
        {err && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {err}
          </div>
        )}
        {!isLoading && !err && conversations.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma conversa encontrada.</p>
        )}
        <ul className="divide-y divide-border/70">
          {conversations.map((c: any) => (
            <li key={c.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-semibold">{c.name}</p>
                <p className="line-clamp-1 text-xs text-muted-foreground">
                  {c.lastMessage || "—"}
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>{new Date(c.updatedTime).toLocaleString("pt-BR")}</p>
                <p className="mt-0.5 rounded-full bg-muted px-2 py-0.5 capitalize">
                  {c.status}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </InstagramLayout>
  );
}

export const Route = createFileRoute("/instagram/mensagens")({
  head: () => ({
    meta: [
      { title: "Mensagens Instagram · DivulgaLinks" },
      { name: "description", content: "Conversas recebidas na conta Instagram." },
    ],
  }),
  component: Page,
});
