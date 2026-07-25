import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getInstagramDashboardStats,
  listInstagramCampaigns,
} from "@/modules/instagram-admin/admin.functions";
import { InstagramLayout } from "./instagram";
import { Loader2 } from "lucide-react";

function Page() {
  const stats = useServerFn(getInstagramDashboardStats);
  const camps = useServerFn(listInstagramCampaigns);
  const s = useQuery({ queryKey: ["ig-admin", "stats"], queryFn: () => stats() });
  const c = useQuery({ queryKey: ["ig-admin", "campaigns"], queryFn: () => camps() });

  const cards = [
    { label: "Stories hoje", value: s.data?.storiesToday ?? 0 },
    { label: "Comentários respondidos", value: s.data?.commentsReplied ?? 0 },
    { label: "DMs enviadas", value: s.data?.dmsSent ?? 0 },
    { label: "Automações executadas", value: s.data?.automationsRun ?? 0 },
    { label: "Taxa de resposta", value: s.data?.responseRate ?? 0 },
  ];

  return (
    <InstagramLayout>
      <div className="space-y-6">
        {s.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {cards.map((k) => (
              <div key={k.label} className="rounded-xl border border-border/70 bg-card p-4">
                <div className="text-xs text-muted-foreground">{k.label}</div>
                <div className="mt-1 font-display text-2xl font-bold">{k.value}</div>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-border/70 bg-card p-6">
            <h3 className="mb-3 text-sm font-semibold">Top produtos enviados (7 dias)</h3>
            {(s.data?.topProducts ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum ainda.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {(s.data?.topProducts ?? []).map((p) => (
                  <li key={p.id} className="flex justify-between gap-3 border-b border-border/40 pb-2">
                    <span className="line-clamp-1">{p.title}</span>
                    <span className="font-semibold text-primary">×{p.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-2xl border border-border/70 bg-card p-6">
            <h3 className="mb-3 text-sm font-semibold">Campanhas recentes</h3>
            {c.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (c.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma campanha.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {(c.data ?? []).slice(0, 10).map((r: any) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
                    <span className="line-clamp-1">
                      {r.keyword ? `#${r.keyword}` : "—"} · {r.story_id ?? "sem story"}
                    </span>
                    <span
                      className={
                        r.status === "published"
                          ? "text-xs font-medium text-emerald-600"
                          : "text-xs font-medium text-destructive"
                      }
                    >
                      {r.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </InstagramLayout>
  );
}

export const Route = createFileRoute("/instagram/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard Instagram · DivulgaLinks" },
      { name: "description", content: "Métricas de Stories, DMs, comentários e automações do Instagram." },
    ],
  }),
  component: Page,
});
