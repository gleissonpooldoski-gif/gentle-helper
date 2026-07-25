import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  deleteStoryTemplate,
  listStoryTemplates,
  saveStoryTemplate,
} from "@/modules/instagram-admin/admin.functions";
import { InstagramLayout } from "./instagram";
import { Loader2, Trash2, Star, Type, Image as ImgIcon, Square } from "lucide-react";

const W = 1080;
const H = 1920;

function Page() {
  const qc = useQueryClient();
  const list = useServerFn(listStoryTemplates);
  const save = useServerFn(saveStoryTemplate);
  const del = useServerFn(deleteStoryTemplate);
  const { data: templates } = useQuery({
    queryKey: ["ig-admin", "templates"],
    queryFn: () => list(),
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<any>(null);
  const [name, setName] = useState("Template");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const { Canvas, Textbox, Rect } = await import("fabric");
      if (disposed || !canvasRef.current) return;
      const c = new Canvas(canvasRef.current, {
        width: W,
        height: H,
        backgroundColor: "#111827",
      });
      fabricRef.current = c;
      // starter placeholders
      c.add(
        new Rect({
          left: 60,
          top: 60,
          width: 960,
          height: 1800,
          rx: 40,
          ry: 40,
          fill: "rgba(255,255,255,0.05)",
          stroke: "#22c55e",
          strokeWidth: 4,
        }),
      );
      c.add(
        new Textbox("{{title}}", {
          left: 100,
          top: 1200,
          width: 880,
          fontSize: 72,
          fill: "#ffffff",
          fontFamily: "Inter",
          fontWeight: "700",
        }),
      );
      c.add(
        new Textbox("{{price}}", {
          left: 100,
          top: 1400,
          width: 880,
          fontSize: 96,
          fill: "#22c55e",
          fontFamily: "Inter",
          fontWeight: "800",
        }),
      );
      c.renderAll();
    })();
    return () => {
      disposed = true;
      fabricRef.current?.dispose?.();
      fabricRef.current = null;
    };
  }, []);

  async function addText() {
    const { Textbox } = await import("fabric");
    fabricRef.current?.add(
      new Textbox("Texto", { left: 200, top: 200, fontSize: 64, fill: "#fff", width: 600 }),
    );
    fabricRef.current?.renderAll();
  }

  async function addImage() {
    const url = window.prompt("URL da imagem (https)");
    if (!url) return;
    const { FabricImage } = await import("fabric");
    const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });
    img.scaleToWidth(600);
    img.set({ left: 240, top: 300 });
    fabricRef.current?.add(img);
    fabricRef.current?.renderAll();
  }

  async function addRect() {
    const { Rect } = await import("fabric");
    fabricRef.current?.add(
      new Rect({ left: 100, top: 100, width: 400, height: 200, fill: "#ef4444" }),
    );
    fabricRef.current?.renderAll();
  }

  function loadTemplate(t: any) {
    if (!fabricRef.current || !t.fabric_json) return;
    fabricRef.current.loadFromJSON(t.fabric_json, () => fabricRef.current?.renderAll());
    setCurrentId(t.id);
    setName(t.name);
    setIsDefault(!!t.is_default);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!fabricRef.current) throw new Error("Canvas não carregado");
      const json = fabricRef.current.toJSON();
      return save({
        data: {
          id: currentId ?? undefined,
          name,
          fabric_json: json,
          is_default: isDefault,
        },
      });
    },
    onSuccess: (r: any) => {
      toast.success("Template salvo");
      setCurrentId(r.id);
      qc.invalidateQueries({ queryKey: ["ig-admin", "templates"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Template removido");
      if (currentId) setCurrentId(null);
      qc.invalidateQueries({ queryKey: ["ig-admin", "templates"] });
    },
  });

  return (
    <InstagramLayout>
      <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-border/70 bg-background px-3 py-1.5 text-sm"
              placeholder="Nome do template"
            />
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
              Padrão
            </label>
            <button
              type="button"
              onClick={addText}
              className="inline-flex items-center gap-1 rounded-lg border border-border/70 bg-background px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Type className="h-4 w-4" /> Texto
            </button>
            <button
              type="button"
              onClick={addImage}
              className="inline-flex items-center gap-1 rounded-lg border border-border/70 bg-background px-3 py-1.5 text-sm hover:bg-muted"
            >
              <ImgIcon className="h-4 w-4" /> Imagem
            </button>
            <button
              type="button"
              onClick={addRect}
              className="inline-flex items-center gap-1 rounded-lg border border-border/70 bg-background px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Square className="h-4 w-4" /> Retângulo
            </button>
            <button
              type="button"
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="ml-auto inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar template
            </button>
          </div>
          <p className="mb-2 text-xs text-muted-foreground">
            Placeholders: <code>{"{{title}}"}</code>, <code>{"{{price}}"}</code>,{" "}
            <code>{"{{original_price}}"}</code>, <code>{"{{discount}}"}</code>,{" "}
            <code>{"{{store}}"}</code>, <code>{"{{product_image}}"}</code>. Serão substituídos ao publicar.
          </p>
          <div className="max-h-[70vh] overflow-auto rounded-xl bg-black/60 p-2">
            <div
              style={{
                width: W / 3,
                height: H / 3,
                position: "relative",
                margin: "0 auto",
              }}
            >
              <canvas
                ref={canvasRef}
                style={{
                  width: `${W / 3}px`,
                  height: `${H / 3}px`,
                  transformOrigin: "top left",
                }}
              />
            </div>
          </div>
        </div>

        <aside className="space-y-3">
          <h3 className="text-sm font-semibold">Templates salvos</h3>
          <ul className="space-y-2">
            {(templates ?? []).map((t: any) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-card p-3"
              >
                <button
                  type="button"
                  onClick={() => loadTemplate(t)}
                  className="flex-1 text-left"
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {t.is_default && <Star className="h-3.5 w-3.5 text-amber-500" />}
                    {t.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString("pt-BR")}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => delMut.mutate(t.id)}
                  className="rounded p-1 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
            {(templates ?? []).length === 0 && (
              <li className="text-sm text-muted-foreground">Nenhum template ainda.</li>
            )}
          </ul>
        </aside>
      </div>
    </InstagramLayout>
  );
}

export const Route = createFileRoute("/instagram/templates")({
  head: () => ({
    meta: [
      { title: "Templates Instagram · DivulgaLinks" },
      { name: "description", content: "Editor visual de templates de Story (Fabric.js)." },
    ],
  }),
  component: Page,
});
