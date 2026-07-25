import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  listInstagramProducts,
  listStoryTemplates,
  publishStoryCampaign,
} from "@/modules/instagram-admin/admin.functions";
import { InstagramLayout } from "./instagram";
import { Loader2 } from "lucide-react";

const W = 1080;
const H = 1920;

function formatBRL(n?: number | null) {
  if (n == null) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fillPlaceholders(input: string, vars: Record<string, string>) {
  let out = input || "";
  for (const [k, v] of Object.entries(vars))
    out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), v ?? "");
  return out;
}

function Page() {
  const qc = useQueryClient();
  const listProducts = useServerFn(listInstagramProducts);
  const listTemplates = useServerFn(listStoryTemplates);
  const publish = useServerFn(publishStoryCampaign);

  const products = useQuery({ queryKey: ["ig-admin", "products"], queryFn: () => listProducts() });
  const templates = useQuery({ queryKey: ["ig-admin", "templates"], queryFn: () => listTemplates() });

  const [productId, setProductId] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [keyword, setKeyword] = useState("link");
  const [message, setMessage] = useState(
    "Olá 👋\n\nSegue sua promoção:\n{{affiliate_link}}",
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<any>(null);

  const product = useMemo(
    () => (products.data ?? []).find((p: any) => p.id === productId),
    [products.data, productId],
  );
  const template = useMemo(
    () => (templates.data ?? []).find((t: any) => t.id === templateId),
    [templates.data, templateId],
  );

  // Auto-pick default template
  useEffect(() => {
    if (!templateId && templates.data?.length) {
      const def = templates.data.find((t: any) => t.is_default) ?? templates.data[0];
      setTemplateId(def.id);
    }
  }, [templates.data, templateId]);

  // Init canvas
  useEffect(() => {
    let disposed = false;
    (async () => {
      const { Canvas } = await import("fabric");
      if (disposed || !canvasRef.current) return;
      const c = new Canvas(canvasRef.current, {
        width: W,
        height: H,
        backgroundColor: "#111827",
      });
      fabricRef.current = c;
    })();
    return () => {
      disposed = true;
      fabricRef.current?.dispose?.();
      fabricRef.current = null;
    };
  }, []);

  // Render preview whenever product/template change
  useEffect(() => {
    const c = fabricRef.current;
    if (!c) return;
    (async () => {
      const fabric = await import("fabric");
      c.clear();
      c.backgroundColor = "#111827";

      const vars: Record<string, string> = {
        title: product?.title ?? "Selecione um produto",
        price: formatBRL(product?.promo_price ?? product?.original_price),
        original_price: formatBRL(product?.original_price),
        discount:
          product?.original_price && product?.promo_price
            ? `-${Math.round(
                (1 - Number(product.promo_price) / Number(product.original_price)) * 100,
              )}%`
            : "",
        store: product?.store_name ?? "",
        product_image: product?.image_url ?? "",
        affiliate_link: product?.affiliate_link ?? "",
      };

      if (template?.fabric_json) {
        await c.loadFromJSON(template.fabric_json);
        c.getObjects().forEach((obj: any) => {
          if (obj.type === "textbox" || obj.type === "i-text" || obj.type === "text") {
            const raw = obj.text ?? "";
            obj.set("text", fillPlaceholders(raw, vars));
          }
        });
        // add product image on top if not present
        if (product?.image_url) {
          try {
            const img = await fabric.FabricImage.fromURL(product.image_url, {
              crossOrigin: "anonymous",
            });
            img.scaleToWidth(720);
            img.set({ left: (W - img.getScaledWidth()) / 2, top: 200, selectable: false });
            c.add(img);
          } catch {
            /* CORS: skip */
          }
        }
      } else {
        // fallback simple layout
        if (product?.image_url) {
          try {
            const img = await fabric.FabricImage.fromURL(product.image_url, {
              crossOrigin: "anonymous",
            });
            img.scaleToWidth(720);
            img.set({ left: (W - img.getScaledWidth()) / 2, top: 200, selectable: false });
            c.add(img);
          } catch {
            /* CORS */
          }
        }
        c.add(
          new fabric.Textbox(vars.title, {
            left: 100,
            top: 1200,
            width: 880,
            fontSize: 64,
            fill: "#ffffff",
            fontFamily: "Inter",
            fontWeight: "700",
            textAlign: "center",
          }),
        );
        c.add(
          new fabric.Textbox(vars.price, {
            left: 100,
            top: 1450,
            width: 880,
            fontSize: 120,
            fill: "#22c55e",
            fontFamily: "Inter",
            fontWeight: "800",
            textAlign: "center",
          }),
        );
      }
      c.renderAll();
    })();
  }, [product, template]);

  const mut = useMutation({
    mutationFn: async () => {
      const c = fabricRef.current;
      if (!c) throw new Error("Canvas não pronto");
      if (!productId) throw new Error("Selecione um produto");
      const dataUrl = c.toDataURL({ format: "png", multiplier: 1 });
      return publish({
        data: {
          productId,
          templateId: templateId || undefined,
          imageBase64: dataUrl,
          keyword: keyword.trim() || undefined,
          message,
        },
      });
    },
    onSuccess: () => {
      toast.success("Story publicado e campanha criada");
      qc.invalidateQueries({ queryKey: ["ig-admin", "campaigns"] });
      qc.invalidateQueries({ queryKey: ["ig-admin", "stats"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao publicar"),
  });

  return (
    <InstagramLayout>
      <div className="grid gap-6 lg:grid-cols-[1fr,360px]">
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          <h2 className="mb-3 text-lg font-semibold">Preview do Story</h2>
          <div className="rounded-xl bg-black/60 p-2">
            <div style={{ width: W / 3, margin: "0 auto" }}>
              <canvas
                ref={canvasRef}
                style={{ width: `${W / 3}px`, height: `${H / 3}px` }}
              />
            </div>
          </div>
        </div>

        <aside className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">Produto</span>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
            >
              <option value="">— selecione —</option>
              {(products.data ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.title?.slice(0, 60)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">Template</span>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
            >
              <option value="">Padrão simples</option>
              {(templates.data ?? []).map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.is_default ? "★" : ""}
                </option>
              ))}
            </select>
          </label>

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
            <span className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">Mensagem DM</span>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
            />
          </label>

          <button
            type="button"
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !productId}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Publicar Story
          </button>
          <p className="text-xs text-muted-foreground">
            Quem responder ao Story com <b>{keyword || "link"}</b>, <b>promoção</b>, <b>oferta</b>,{" "}
            <b>cupom</b> ou <b>desconto</b> recebe a DM automaticamente com o link do produto.
          </p>
        </aside>
      </div>
    </InstagramLayout>
  );
}

export const Route = createFileRoute("/instagram/stories")({
  head: () => ({
    meta: [
      { title: "Publicar Story · DivulgaLinks" },
      { name: "description", content: "Gere e publique Stories automatizados a partir de produtos." },
    ],
  }),
  component: Page,
});
