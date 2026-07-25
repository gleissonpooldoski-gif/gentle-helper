import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  listVisualTemplates,
  createVisualTemplate,
  duplicateVisualTemplate,
  deleteVisualTemplate,
} from "@/modules/visual-templates/templates.functions";
import { PRESET_LABELS, FORMAT_SIZE } from "@/modules/visual-templates/presets";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Copy, Trash2, Pencil, LayoutTemplate } from "lucide-react";

export const Route = createFileRoute("/templates")({
  component: TemplatesPage,
  head: () => ({
    meta: [
      { title: "Templates visuais — Editor de posts de afiliados" },
      {
        name: "description",
        content:
          "Crie artes de posts para Instagram Story, Post e WhatsApp com editor visual drag and drop.",
      },
      { property: "og:title", content: "Templates visuais" },
      {
        property: "og:description",
        content: "Editor Canva-like focado em ofertas de afiliados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const FORMAT_LABEL: Record<string, string> = {
  ig_story: "Instagram Story",
  ig_post: "Instagram Post",
  whatsapp: "WhatsApp",
};

function TemplatesPage() {
  const list = useServerFn(listVisualTemplates);
  const create = useServerFn(createVisualTemplate);
  const dup = useServerFn(duplicateVisualTemplate);
  const del = useServerFn(deleteVisualTemplate);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const templates = useQuery({
    queryKey: ["visual_templates"],
    queryFn: () => list({ data: {} }),
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Novo template");
  const [format, setFormat] = useState<"ig_story" | "ig_post" | "whatsapp">("ig_story");
  const [preset, setPreset] = useState("oferta_relampago");

  const createMut = useMutation({
    mutationFn: () => create({ data: { name, format, preset } }),
    onSuccess: ({ id }) => {
      setOpen(false);
      navigate({ to: "/templates/editor/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dupMut = useMutation({
    mutationFn: (id: string) => dup({ data: { id } }),
    onSuccess: () => {
      toast.success("Template duplicado");
      qc.invalidateQueries({ queryKey: ["visual_templates"] });
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Template excluído");
      qc.invalidateQueries({ queryKey: ["visual_templates"] });
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Templates visuais</h1>
          <p className="text-sm text-muted-foreground">
            Crie artes de posts arrastando elementos. Sem código, sem coordenadas.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="gap-2">
              <Plus className="h-4 w-4" /> Novo template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Novo template</DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              <div>
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label className="mb-2 block">Formato</Label>
                <RadioGroup
                  value={format}
                  onValueChange={(v) => setFormat(v as typeof format)}
                  className="grid grid-cols-3 gap-3"
                >
                  {(Object.keys(FORMAT_LABEL) as (keyof typeof FORMAT_LABEL)[]).map((f) => {
                    const size = FORMAT_SIZE[f as keyof typeof FORMAT_SIZE];
                    return (
                      <label
                        key={f}
                        htmlFor={`fmt-${f}`}
                        className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 p-4 transition ${
                          format === f ? "border-primary bg-primary/5" : "border-border"
                        }`}
                      >
                        <RadioGroupItem id={`fmt-${f}`} value={f} className="sr-only" />
                        <div
                          className="rounded bg-muted"
                          style={{
                            width: 60,
                            height: (60 * size.h) / size.w,
                          }}
                        />
                        <span className="text-sm font-medium">{FORMAT_LABEL[f]}</span>
                        <span className="text-xs text-muted-foreground">
                          {size.w}×{size.h}
                        </span>
                      </label>
                    );
                  })}
                </RadioGroup>
              </div>
              <div>
                <Label className="mb-2 block">Modelo inicial</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {PRESET_LABELS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPreset(p.id)}
                      className={`rounded-lg border-2 p-3 text-left transition ${
                        preset === p.id ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <div className="text-sm font-semibold">{p.label}</div>
                      <div className="text-xs text-muted-foreground">{p.hint}</div>
                    </button>
                  ))}
                </div>
              </div>
              <Button
                className="w-full"
                size="lg"
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending}
              >
                {createMut.isPending ? "Criando..." : "Criar template"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {templates.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : templates.data && templates.data.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {templates.data.map((t) => (
            <Card key={t.id} className="group overflow-hidden">
              <Link
                to="/templates/editor/$id"
                params={{ id: t.id }}
                className="block aspect-[9/16] bg-muted"
              >
                {t.preview_url ? (
                  <img src={t.preview_url} alt={t.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <LayoutTemplate className="h-10 w-10" />
                  </div>
                )}
              </Link>
              <div className="p-3">
                <div className="truncate text-sm font-semibold">{t.name}</div>
                <div className="text-xs text-muted-foreground">
                  {FORMAT_LABEL[t.format] ?? t.format}
                </div>
                <div className="mt-2 flex gap-1">
                  <Button size="sm" variant="secondary" asChild className="flex-1">
                    <Link to="/templates/editor/$id" params={{ id: t.id }}>
                      <Pencil className="mr-1 h-3 w-3" /> Editar
                    </Link>
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => dupMut.mutate(t.id)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Excluir "${t.name}"?`)) delMut.mutate(t.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <LayoutTemplate className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Nenhum template ainda</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Comece criando seu primeiro template a partir de um modelo pronto.
          </p>
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Novo template
          </Button>
        </Card>
      )}
    </div>
  );
}
