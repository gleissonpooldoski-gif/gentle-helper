import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ExternalLink, Heart, Loader2, MessageCircle, RefreshCcw, Zap } from "lucide-react";
import { listInstagramMedia } from "@/modules/instagram-admin/admin.functions";
import { NewAutomationModal } from "@/components/instagram/NewAutomationModal";
import { InstagramLayout } from "./instagram";

function Page() {
  const qc = useQueryClient();
  const list = useServerFn(listInstagramMedia);
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["ig-admin", "media"],
    queryFn: () => list(),
  });

  const [selected, setSelected] = useState<{
    id: string;
    caption?: string | null;
    permalink?: string | null;
  } | null>(null);

  return (
    <InstagramLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card p-4">
          <div>
            <h2 className="text-lg font-semibold">Publicações recentes</h2>
            <p className="text-xs text-muted-foreground">
              Cada card pode ativar uma automação exclusiva de comentário + DM.
            </p>
          </div>
          <button
            type="button"
            onClick={() => qc.invalidateQueries({ queryKey: ["ig-admin", "media"] })}
            className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-1.5 text-sm hover:bg-muted"
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            Atualizar
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando publicações…
          </div>
        )}
        {error && (
          <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}
        {!isLoading && data && data.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/70 bg-card p-8 text-center text-sm text-muted-foreground">
            Nenhuma publicação encontrada no feed conectado.
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(data ?? []).map((m: any) => (
            <article
              key={m.id}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition hover:shadow-md"
            >
              <div className="relative aspect-[9/12] w-full overflow-hidden bg-muted">
                {(m.thumbnail_url || m.media_url) && (
                  <img
                    src={m.thumbnail_url ?? m.media_url}
                    alt={m.caption?.slice(0, 80) ?? "Publicação Instagram"}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                )}
                {m.media_type && (
                  <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
                    {m.media_type === "VIDEO"
                      ? "Reels"
                      : m.media_type === "CAROUSEL_ALBUM"
                        ? "Carrossel"
                        : "Post"}
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-3 p-3">
                <div className="flex items-center justify-around rounded-lg bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Heart className="h-3.5 w-3.5" /> {m.like_count ?? 0} likes
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle className="h-3.5 w-3.5" /> {m.comments_count ?? 0}
                  </span>
                </div>

                {m.caption && (
                  <p className="line-clamp-2 text-xs text-foreground/80">{m.caption}</p>
                )}

                <div className="mt-auto space-y-2">
                  {m.permalink && (
                    <a
                      href={m.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-700"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Ver no Instagram
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setSelected({
                        id: m.id,
                        caption: m.caption ?? null,
                        permalink: m.permalink ?? null,
                      })
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Nova Automação
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      {selected && (
        <NewAutomationModal
          open={!!selected}
          onClose={() => setSelected(null)}
          mediaId={selected.id}
          mediaCaption={selected.caption}
          mediaPermalink={selected.permalink}
        />
      )}
    </InstagramLayout>
  );
}

export const Route = createFileRoute("/instagram/publicacoes")({
  head: () => ({
    meta: [
      { title: "Publicações Instagram · DivulgaLinks" },
      { name: "description", content: "Feed do Instagram com automações por post." },
    ],
  }),
  component: Page,
});
