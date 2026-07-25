import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  deleteInstagramAutomation,
  listInstagramAutomations,
  listInstagramProducts,
  saveInstagramAutomation,
} from "@/modules/instagram-admin/admin.functions";
import { InstagramLayout } from "./instagram";
import { Loader2, Trash2 } from "lucide-react";

function Page() {
  const qc = useQueryClient();
  const list = useServerFn(listInstagramAutomations);
  const save = useServerFn(saveInstagramAutomation);
  const del = useServerFn(deleteInstagramAutomation);
  const listProducts = useServerFn(listInstagramProducts);

  const { data, isLoading } = useQuery({
    queryKey: ["ig-admin", "automations"],
    queryFn: () => list(),
  });
  const products = useQuery({ queryKey: ["ig-admin", "products"], queryFn: () => listProducts() });

  const [keyword, setKeyword] = useState("");
  const [message, setMessage] = useState(
    "Olá 👋\n\nSegue sua promoção:\n{{affiliate_link}}",
  );
  const [productId, setProductId] = useState("");
  const [scope, setScope] = useState<"both" | "comment" | "message">("both");

  const saveMut = useMutation({
    mutationFn: () =>
      save({
        data: {
          keyword,
          message,
          product_id: productId || undefined,
          scope,
        } as any,
      }),
    onSuccess: () => {
      toast.success("Automação salva");
      setKeyword("");
      qc.invalidateQueries({ queryKey: ["ig-admin", "automations"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ig-admin", "automations"] }),
  });

  return (
    <InstagramLayout>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Nova automação</h2>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">Palavra-chave</span>
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="link"
                className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">Escopo</span>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as any)}
                className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
              >
                <option value="both">Comentário + DM</option>
                <option value="comment">Apenas comentários</option>
                <option value="message">Apenas DMs</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">Produto relacionado</span>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
              >
                <option value="">— nenhum —</option>
                {(products.data ?? []).map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.title?.slice(0, 60)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">Mensagem</span>
              <textarea
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
              />
              <span className="text-xs text-muted-foreground">
                Placeholder: <code>{"{{affiliate_link}}"}</code>
              </span>
            </label>
            <button
              type="button"
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !keyword || !message}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar automação
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Automações ativas</h2>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {(data ?? []).length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground">Nenhuma automação.</p>
          )}
          <ul className="space-y-2">
            {(data ?? []).map((a: any) => (
              <li
                key={a.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-background p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold">#{a.keyword}</div>
                  <div className="line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">
                    {a.message}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => delMut.mutate(a.id)}
                  className="rounded p-1 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </InstagramLayout>
  );
}

export const Route = createFileRoute("/instagram/automacoes")({
  head: () => ({
    meta: [
      { title: "Automações Instagram · DivulgaLinks" },
      { name: "description", content: "Regras de DM e comentários automáticos por palavra-chave." },
    ],
  }),
  component: Page,
});
