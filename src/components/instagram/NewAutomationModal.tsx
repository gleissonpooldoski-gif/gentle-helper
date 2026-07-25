import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import {
  deleteInstagramAutomation,
  listInstagramAutomations,
  saveInstagramAutomation,
  suggestAutomationCopy,
} from "@/modules/instagram-admin/admin.functions";

type Props = {
  open: boolean;
  onClose: () => void;
  mediaId: string;
  mediaCaption?: string | null;
  mediaPermalink?: string | null;
};

type ExtraLink = { label: string; url: string };

export function NewAutomationModal({
  open,
  onClose,
  mediaId,
  mediaCaption,
  mediaPermalink,
}: Props) {
  const qc = useQueryClient();
  const list = useServerFn(listInstagramAutomations);
  const save = useServerFn(saveInstagramAutomation);
  const del = useServerFn(deleteInstagramAutomation);
  const suggest = useServerFn(suggestAutomationCopy);

  const existing = useQuery({
    queryKey: ["ig-admin", "automations", mediaId],
    queryFn: () => list({ data: { mediaId } }),
    enabled: open && !!mediaId,
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [commentReply, setCommentReply] = useState("");
  const [dmMessage, setDmMessage] = useState("");
  const [buttonLabel, setButtonLabel] = useState("VER NA SHOPEE");
  const [buttonUrl, setButtonUrl] = useState("");
  const [extraLinks, setExtraLinks] = useState<ExtraLink[]>([]);

  useEffect(() => {
    if (!open) return;
    setEditingId(null);
    setKeyword("");
    setCommentReply("");
    setDmMessage("");
    setButtonLabel("VER NA SHOPEE");
    setButtonUrl("");
    setExtraLinks([]);
  }, [open, mediaId]);

  function loadForEdit(a: any) {
    setEditingId(a.id);
    setKeyword(a.keyword ?? "");
    setCommentReply(a.comment_reply ?? "");
    setDmMessage(a.message ?? "");
    setButtonLabel(a.button_label ?? "VER NA SHOPEE");
    setButtonUrl(a.button_url ?? "");
    setExtraLinks(Array.isArray(a.extra_links) ? a.extra_links : []);
  }

  const aiMut = useMutation({
    mutationFn: () =>
      suggest({
        data: {
          caption: mediaCaption ?? undefined,
          mediaId,
        },
      }),
    onSuccess: (r) => {
      setKeyword((v) => v || r.keyword);
      setCommentReply((v) => v || r.comment_reply);
      setDmMessage((v) => v || r.dm_message);
      setButtonLabel((v) => v || r.button_label);
      toast.success("Copy preenchido pela IA");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao gerar copy"),
  });

  const saveMut = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: editingId ?? undefined,
          media_id: mediaId,
          keyword: keyword.trim(),
          message: dmMessage,
          comment_reply: commentReply,
          button_label: buttonLabel,
          button_url: buttonUrl || undefined,
          extra_links: extraLinks.filter((l) => l.label && l.url),
          scope: "both",
        },
      }),
    onSuccess: () => {
      toast.success(editingId ? "Automação atualizada" : "Automação criada");
      qc.invalidateQueries({ queryKey: ["ig-admin", "automations", mediaId] });
      qc.invalidateQueries({ queryKey: ["ig-admin", "automations"] });
      setEditingId(null);
      setKeyword("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ig-admin", "automations", mediaId] });
      qc.invalidateQueries({ queryKey: ["ig-admin", "automations"] });
      toast.success("Automação removida");
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 md:items-center">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl">
        <header className="flex items-start justify-between border-b border-border/70 bg-muted/40 p-5">
          <div>
            <h2 className="text-lg font-bold">Nova Automação</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Configurando nova automação para o Reel/Post ID:{" "}
              <span className="font-mono text-foreground/80">{mediaId}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="max-h-[75vh] space-y-4 overflow-y-auto p-5">
          <button
            type="button"
            onClick={() => aiMut.mutate()}
            disabled={aiMut.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-slate-600 to-slate-800 px-4 py-3 text-sm font-semibold text-white shadow transition hover:opacity-90 disabled:opacity-50"
          >
            {aiMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Preencher Automaticamente
          </button>

          {existing.data && existing.data.length > 0 && (
            <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                Automações deste post
              </p>
              <ul className="space-y-1.5">
                {existing.data.map((a: any) => (
                  <li
                    key={a.id}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                      editingId === a.id
                        ? "border-primary/60 bg-primary/5"
                        : "border-border/70 bg-background"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => loadForEdit(a)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="font-semibold">#{a.keyword}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {a.enabled ? "ativa" : "pausada"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => delMut.mutate(a.id)}
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                      aria-label="Remover automação"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Field
            label="PALAVRA CHAVE GATILHO (EX: EU QUERO)"
            input={
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="eu quero"
                className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
              />
            }
          />

          <Field
            label="FRASE DE RESPOSTA AO COMENTÁRIO"
            hint='Escreva "auto" para respostas geradas automaticamente; ou várias separadas por ; (ponto e vírgula). Ex.: Minha resposta 1; Minha resposta 2'
            input={
              <input
                value={commentReply}
                onChange={(e) => setCommentReply(e.target.value)}
                placeholder="auto"
                className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
              />
            }
          />

          <Field
            label="TEXTO ENVIADO NO DIRECT (EX: OI! AQUI ESTÁ SEU LINK)"
            hint={`Limite de 500 caracteres. Use {{link}} para inserir o link.`}
            input={
              <textarea
                rows={4}
                value={dmMessage}
                onChange={(e) => setDmMessage(e.target.value.slice(0, 500))}
                className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
              />
            }
          />

          <Field
            label="TEXTO DE DESTAQUE (EX: VER NA SHOPEE)"
            input={
              <input
                value={buttonLabel}
                onChange={(e) => setButtonLabel(e.target.value)}
                className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
              />
            }
          />

          <Field
            label="LINK DE AFILIADO (EX: HTTPS://SHOPEE.COM)"
            hint="Enter a valid URL: https://www.google.com"
            input={
              <input
                type="url"
                value={buttonUrl}
                onChange={(e) => setButtonUrl(e.target.value)}
                placeholder="https://s.shopee.com.br/..."
                className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
              />
            }
          />

          {extraLinks.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr,2fr,auto] gap-2">
              <input
                value={l.label}
                onChange={(e) =>
                  setExtraLinks((s) =>
                    s.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)),
                  )
                }
                placeholder="Rótulo extra"
                className="rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
              />
              <input
                value={l.url}
                onChange={(e) =>
                  setExtraLinks((s) =>
                    s.map((x, idx) => (idx === i ? { ...x, url: e.target.value } : x)),
                  )
                }
                placeholder="https://…"
                className="rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => setExtraLinks((s) => s.filter((_, idx) => idx !== i))}
                className="rounded-lg border border-border/70 bg-background px-2 text-muted-foreground hover:text-destructive"
                aria-label="Remover link"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              setExtraLinks((s) => [...s, { label: "", url: "" }])
            }
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Adicionar link
          </button>

          <button
            type="button"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || !keyword.trim() || !dmMessage.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-blue-700 disabled:opacity-50"
          >
            {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            💾 {editingId ? "Atualizar" : "Salvar"}
          </button>

          {mediaPermalink && (
            <a
              href={mediaPermalink}
              target="_blank"
              rel="noreferrer"
              className="block text-center text-xs text-muted-foreground underline underline-offset-2"
            >
              Ver post no Instagram
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  input,
}: {
  label: string;
  hint?: string;
  input: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {input}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
