import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  deleteInstagramAutomation,
  listInstagramAutomations,
  saveInstagramAutomation,
} from "@/modules/instagram-admin/admin.functions";
import { InstagramLayout } from "./instagram";
import { Loader2, Trash2 } from "lucide-react";

function Page() {
  const qc = useQueryClient();
  const list = useServerFn(listInstagramAutomations);
  const save = useServerFn(saveInstagramAutomation);
  const del = useServerFn(deleteInstagramAutomation);
  const { data, isLoading } = useQuery({
    queryKey: ["ig-admin", "automations"],
    queryFn: () => list(),
  });

  const [keyword, setKeyword] = useState("");
  const [message, setMessage] = useState(
    "Olá 👋\n\nSegue sua promoção:\n{{affiliate_link}}",
  );

  const saveMut = useMutation({
    mutationFn: () => save({ data: { keyword, message } }),
    onSuccess: () => {
      toast.success("Automação salva");
      setKeyword("");
      qc.invalidateQueries({ queryKey: ["ig-admin", "automations"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Automação removida");
      qc.invalidateQueries({ queryKey: ["ig-admin", "automations"] });
    },
  });

  const toggle = useMutation({
    mutationFn: (r: { id: string; keyword: string; message: string; enabled: boolean }) =>
      save({ data: r }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ig-admin", "automations"] }),
  });

  return (
    <InstagramLayout>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border/70 bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Nova automação</h2>
          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Palavra-chave
            </span>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="link"
              className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </label>
          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Mensagem automática
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              Use {"{{"}affiliate_link{"}}"} para o link.
            </span>
          </label>
          <button
            type="button"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || !keyword || !message}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Automações ativas</h2>
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          )}
          {!isLoading && data && data.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma automação criada.</p>
          )}
          <ul className="space-y-3">
            {(data ?? []).map((a: any) => (
              <li key={a.id} className="rounded-xl border border-border/70 bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">🔑 {a.keyword}</p>
                    <pre className="mt-1 whitespace-pre-wrap text-xs text-foreground/80">
                      {a.message}
                    </pre>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={a.enabled}
                        onChange={(e) =>
                          toggle.mutate({
                            id: a.id,
                            keyword: a.keyword,
                            message: a.message,
                            enabled: e.target.checked,
                          })
                        }
                      />
                      {a.enabled ? "ativa" : "inativa"}
                    </label>
                    <button
                      type="button"
                      onClick={() => delMut.mutate(a.id)}
                      className="text-destructive hover:opacity-80"
                      aria-label="Remover"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </InstagramLayout>
  );
}

export const Route = createFileRoute("/instagram/automacoes")({
  head: () => ({
    meta: [
      { title: "Automações Instagram · DivulgaLinks" },
      { name: "description", content: "Respostas automáticas por palavra-chave em DMs." },
    ],
  }),
  component: Page,
});
