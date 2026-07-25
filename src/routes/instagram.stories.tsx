import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { publishInstagramStory } from "@/modules/instagram-admin/admin.functions";
import { InstagramLayout } from "./instagram";
import { Loader2 } from "lucide-react";

function Page() {
  const publish = useServerFn(publishInstagramStory);
  const [imageUrl, setImageUrl] = useState("");
  const [caption, setCaption] = useState("");

  const mut = useMutation({
    mutationFn: () => publish({ data: { imageUrl, caption } }),
    onSuccess: () => {
      toast.success("Story publicado com sucesso");
      setImageUrl("");
      setCaption("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao publicar"),
  });

  return (
    <InstagramLayout>
      <div className="max-w-2xl space-y-4 rounded-2xl border border-border/70 bg-card p-6">
        <h2 className="text-lg font-semibold">Publicar Story</h2>
        <p className="text-sm text-muted-foreground">
          A imagem deve estar em uma URL pública HTTPS acessível pela Meta.
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            URL da imagem
          </span>
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…/story.jpg"
            className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Legenda (opcional)
          </span>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        {imageUrl && (
          <div className="overflow-hidden rounded-xl border border-border/70">
            <img src={imageUrl} alt="preview" className="max-h-96 w-full object-contain" />
          </div>
        )}
        {mut.isPending && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Publicando…
          </p>
        )}
        <button
          type="button"
          onClick={() => mut.mutate()}
          disabled={mut.isPending || !imageUrl}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          Publicar Story
        </button>
      </div>
    </InstagramLayout>
  );
}

export const Route = createFileRoute("/instagram/stories")({
  head: () => ({
    meta: [
      { title: "Publicar Story · DivulgaLinks" },
      { name: "description", content: "Envie um Story diretamente para o Instagram conectado." },
    ],
  }),
  component: Page,
});
