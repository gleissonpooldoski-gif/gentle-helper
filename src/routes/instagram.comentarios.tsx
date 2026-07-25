import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  listInstagramAdminComments,
  replyInstagramAdminComment,
} from "@/modules/instagram-admin/admin.functions";
import { InstagramLayout } from "./instagram";
import { Loader2 } from "lucide-react";

function Page() {
  const qc = useQueryClient();
  const list = useServerFn(listInstagramAdminComments);
  const reply = useServerFn(replyInstagramAdminComment);
  const { data, isLoading, error } = useQuery({
    queryKey: ["ig-admin", "comments"],
    queryFn: () => list(),
  });

  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const mut = useMutation({
    mutationFn: (c: { commentId: string; mediaId?: string; username?: string; text: string; reply: string }) =>
      reply({ data: c }),
    onSuccess: (_res, vars) => {
      toast.success("Resposta enviada");
      setDrafts((d) => ({ ...d, [vars.commentId]: "" }));
      qc.invalidateQueries({ queryKey: ["ig-admin", "comments"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao responder"),
  });

  return (
    <InstagramLayout>
      <div className="rounded-2xl border border-border/70 bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Comentários recentes</h2>
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
          <p className="text-sm text-muted-foreground">Nenhum comentário encontrado.</p>
        )}
        <ul className="space-y-3">
          {(data ?? []).map((c: any) => (
            <li
              key={c.commentId}
              className="rounded-xl border border-border/70 bg-background p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">@{c.username ?? "—"}</p>
                  <p className="text-sm text-foreground/80">{c.text}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(c.timestamp).toLocaleString("pt-BR")}
                  </p>
                </div>
              </div>
              {c.reply && (
                <p className="mt-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
                  ✅ Respondido: {c.reply}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <input
                  value={drafts[c.commentId] ?? ""}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [c.commentId]: e.target.value }))
                  }
                  placeholder="Sua resposta…"
                  className="flex-1 rounded-lg border border-border/70 bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() =>
                    mut.mutate({
                      commentId: c.commentId,
                      mediaId: c.mediaId,
                      username: c.username,
                      text: c.text,
                      reply: drafts[c.commentId] ?? "",
                    })
                  }
                  disabled={mut.isPending || !(drafts[c.commentId] ?? "").trim()}
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  Responder
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </InstagramLayout>
  );
}

export const Route = createFileRoute("/instagram/comentarios")({
  head: () => ({
    meta: [
      { title: "Comentários Instagram · DivulgaLinks" },
      { name: "description", content: "Responda comentários das publicações do Instagram." },
    ],
  }),
  component: Page,
});
