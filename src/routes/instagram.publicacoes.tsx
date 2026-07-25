import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listInstagramMedia } from "@/modules/instagram-admin/admin.functions";
import { InstagramLayout } from "./instagram";
import { Loader2 } from "lucide-react";

function Page() {
  const list = useServerFn(listInstagramMedia);
  const { data, isLoading, error } = useQuery({
    queryKey: ["ig-admin", "media"],
    queryFn: () => list(),
  });

  return (
    <InstagramLayout>
      <div className="rounded-2xl border border-border/70 bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Publicações recentes</h2>
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}
        {!isLoading && data && data.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma publicação encontrada.</p>
        )}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {(data ?? []).map((m) => (
            <a
              key={m.id}
              href={m.permalink}
              target="_blank"
              rel="noreferrer"
              className="group overflow-hidden rounded-xl border border-border/70 bg-background"
            >
              <div className="aspect-square bg-muted">
                {(m.thumbnail_url || m.media_url) && (
                  <img
                    src={m.thumbnail_url ?? m.media_url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                )}
              </div>
              <div className="p-2 text-xs">
                <p className="line-clamp-2 text-foreground">{m.caption ?? "—"}</p>
                <p className="mt-1 text-muted-foreground">
                  💬 {m.comments_count ?? 0} · ❤️ {m.like_count ?? 0}
                </p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </InstagramLayout>
  );
}

export const Route = createFileRoute("/instagram/publicacoes")({
  head: () => ({
    meta: [
      { title: "Publicações Instagram · DivulgaLinks" },
      { name: "description", content: "Feed recente da conta Instagram conectada." },
    ],
  }),
  component: Page,
});
