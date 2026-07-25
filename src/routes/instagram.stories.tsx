import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  deleteStoryTemplate,
  getAdminStorySchedule,
  listInstagramProducts,
  listStoryTemplates,
  publishStoryCampaign,
  saveAdminStorySchedule,
  saveStoryTemplate,
} from "@/modules/instagram-admin/admin.functions";
import { InstagramLayout } from "./instagram";
import { CalendarClock, CheckCircle2, ExternalLink, Image as ImageIcon, Loader2, Save, Trash2, Upload } from "lucide-react";

const W = 1080;
const H = 1920;

function formatBRL(n?: number | null) {
  if (n == null) return "";
  return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function TemplateCard({ template, onSaved }: { template?: any; onSaved: () => void }) {
  const save = useServerFn(saveStoryTemplate);
  const del = useServerFn(deleteStoryTemplate);

  const [name, setName] = useState(template?.name ?? "Novo template");
  const [titleColor, setTitleColor] = useState(template?.title_color ?? "#111111");
  const [priceColor, setPriceColor] = useState(template?.price_color ?? "#ef4444");
  const [fileName, setFileName] = useState<string>(template?.image_url ? "Template atual" : "");
  const [preview, setPreview] = useState<string | null>(template?.image_url ?? null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isDefault, setIsDefault] = useState<boolean>(!!template?.is_default);

  const saveMut = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: template?.id,
          name,
          title_color: titleColor,
          price_color: priceColor,
          image_base64: imageBase64 ?? undefined,
          is_default: isDefault,
        } as any,
      }),
    onSuccess: () => {
      toast.success("Template salvo");
      setImageBase64(null);
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  const delMut = useMutation({
    mutationFn: () => del({ data: { id: template!.id } }),
    onSuccess: () => {
      toast.success("Template removido");
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao remover"),
  });

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 8MB)");
      return;
    }
    const b64 = await fileToBase64(f);
    setImageBase64(b64);
    setPreview(b64);
    setFileName(f.name);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <header className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-3">
        <ImageIcon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Template IG Story (9:16)</h3>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="ml-auto rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-muted-foreground hover:border-border focus:border-primary focus:outline-none"
        />
        {template && (
          <button
            type="button"
            onClick={() => confirm("Remover template?") && delMut.mutate()}
            className="rounded p-1 text-muted-foreground hover:text-destructive"
            aria-label="Remover"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </header>

      <div className="space-y-4 p-4">
        <a
          href="https://www.canva.com/design/?category=tACZCns7HZk"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-lg bg-sky-100 px-3 py-2 text-xs font-medium text-sky-900 hover:bg-sky-200 dark:bg-sky-950/40 dark:text-sky-200"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Clique aqui para editar o template no Canva.
        </a>

        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Escolha um arquivo
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/70 bg-background px-3 py-2 text-sm hover:bg-muted">
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
              <Upload className="h-3.5 w-3.5" /> Escolher arquivo
            </span>
            <span className="line-clamp-1 flex-1 text-xs text-muted-foreground">
              {fileName || "Nenhum arquivo escolhido"}
            </span>
            <input type="file" accept="image/*" onChange={onFile} className="hidden" />
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Cor do título
            </label>
            <input
              type="color"
              value={titleColor}
              onChange={(e) => setTitleColor(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-md border border-border/70 bg-background"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Cor do preço
            </label>
            <input
              type="color"
              value={priceColor}
              onChange={(e) => setPriceColor(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-md border border-border/70 bg-background"
            />
          </div>
          <label className="mb-1 inline-flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            Padrão
          </label>
          <button
            type="button"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 px-5 py-2 text-sm font-semibold text-white shadow hover:opacity-95 disabled:opacity-50"
          >
            {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>

        <div className="flex justify-center pt-2">
          <div
            className="relative aspect-[9/16] w-full max-w-[240px] overflow-hidden rounded-xl border border-border/60 bg-yellow-300 shadow-md"
            style={preview ? { backgroundImage: `url(${preview})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
          >
            {!preview && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center text-[10px] text-yellow-950/70">
                <ImageIcon className="mb-2 h-8 w-8" />
                Envie a arte 1080×1920 do template
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-4 top-1/2 -translate-y-1/2 space-y-2">
              <div
                className="mx-auto h-6 rounded-md"
                style={{ backgroundColor: priceColor, width: "70%" }}
                title="Área do preço"
              />
              <div
                className="mx-auto h-4 rounded"
                style={{ backgroundColor: titleColor, width: "55%", opacity: 0.85 }}
                title="Área do título"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PublishBox() {
  const qc = useQueryClient();
  const listProducts = useServerFn(listInstagramProducts);
  const listTemplates = useServerFn(listStoryTemplates);
  const publish = useServerFn(publishStoryCampaign);

  const products = useQuery({ queryKey: ["ig-admin", "products"], queryFn: () => listProducts() });
  const templates = useQuery({ queryKey: ["ig-admin", "templates"], queryFn: () => listTemplates() });

  const [productId, setProductId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [keyword, setKeyword] = useState("eu quero");
  const [message, setMessage] = useState("Olá 👋\n\nAqui está seu link:\n{{affiliate_link}}");

  useEffect(() => {
    if (!templateId && templates.data?.length) {
      const def = templates.data.find((t: any) => t.is_default) ?? templates.data[0];
      setTemplateId(def.id);
    }
  }, [templates.data, templateId]);

  const product = useMemo(
    () => (products.data ?? []).find((p: any) => p.id === productId),
    [products.data, productId],
  );
  const template = useMemo(
    () => (templates.data ?? []).find((t: any) => t.id === templateId),
    [templates.data, templateId],
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Compose preview — matches the "Divulga Links" reference layout:
  //  · Product photo centered in the template's white frame
  //  · Title (up to 2 lines) below the product
  //  · Colored bar with "POR R$ XX,XX" (+ small strike "DE R$ Y") at the bottom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = W;
    canvas.height = H;

    const FRAME = { x: 90, y: 340, w: 900, h: 1240 };
    const PROD = { x: FRAME.x + 40, y: FRAME.y + 40, w: FRAME.w - 80, h: 760 };
    const TITLE_Y = PROD.y + PROD.h + 60;
    const BAR = { x: FRAME.x + 30, y: FRAME.y + FRAME.h - 210, w: FRAME.w - 60, h: 170 };

    const drawText = () => {
      const promo = product?.promo_price ?? null;
      const original = product?.original_price ?? null;
      const priceStr = formatBRL(promo ?? original);
      const originalStr =
        promo && original && Number(original) > Number(promo) ? formatBRL(original) : "";
      const title = product?.title ?? "Selecione um produto";

      // TITLE
      ctx.fillStyle = template?.title_color ?? "#111111";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = "700 60px Inter, system-ui, sans-serif";
      const words = title.split(" ");
      const maxLineWidth = FRAME.w - 100;
      const lines: string[] = [];
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (ctx.measureText(test).width > maxLineWidth && line) {
          lines.push(line);
          line = w;
        } else line = test;
      }
      if (line) lines.push(line);
      lines.slice(0, 2).forEach((ln, i) => ctx.fillText(ln, W / 2, TITLE_Y + i * 72));

      // PRICE BAR (rounded rectangle in priceColor)
      if (priceStr) {
        const barColor = template?.price_color ?? "#6d28d9";
        const r = 24;
        ctx.fillStyle = barColor;
        ctx.beginPath();
        ctx.moveTo(BAR.x + r, BAR.y);
        ctx.arcTo(BAR.x + BAR.w, BAR.y, BAR.x + BAR.w, BAR.y + BAR.h, r);
        ctx.arcTo(BAR.x + BAR.w, BAR.y + BAR.h, BAR.x, BAR.y + BAR.h, r);
        ctx.arcTo(BAR.x, BAR.y + BAR.h, BAR.x, BAR.y, r);
        ctx.arcTo(BAR.x, BAR.y, BAR.x + BAR.w, BAR.y, r);
        ctx.closePath();
        ctx.fill();

        let priceY = BAR.y + BAR.h / 2;
        if (originalStr) {
          ctx.fillStyle = "rgba(255,255,255,0.92)";
          ctx.font = "600 34px Inter, system-ui, sans-serif";
          ctx.textBaseline = "middle";
          const deLabel = `DE ${originalStr}`;
          const dy = BAR.y + 44;
          ctx.fillText(deLabel, W / 2, dy);
          const tw = ctx.measureText(deLabel).width;
          ctx.strokeStyle = "rgba(255,255,255,0.92)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(W / 2 - tw / 2, dy);
          ctx.lineTo(W / 2 + tw / 2, dy);
          ctx.stroke();
          priceY = BAR.y + BAR.h - 58;
        }

        ctx.fillStyle = "#ffffff";
        ctx.textBaseline = "middle";
        ctx.font = "700 44px Inter, system-ui, sans-serif";
        const porW = ctx.measureText("POR ").width;
        ctx.font = "900 96px Inter, system-ui, sans-serif";
        const priceW = ctx.measureText(priceStr).width;
        const totalW = porW + priceW;
        const startX = (W - totalW) / 2;
        ctx.textAlign = "left";
        ctx.font = "700 44px Inter, system-ui, sans-serif";
        ctx.fillText("POR ", startX, priceY);
        ctx.font = "900 96px Inter, system-ui, sans-serif";
        ctx.fillText(priceStr, startX + porW, priceY);
        ctx.textAlign = "center";
      }
    };

    const drawProduct = (img: HTMLImageElement) => {
      const ratio = Math.min(PROD.w / img.width, PROD.h / img.height);
      const w = img.width * ratio;
      const h = img.height * ratio;
      const x = PROD.x + (PROD.w - w) / 2;
      const y = PROD.y + (PROD.h - h) / 2;
      ctx.drawImage(img, x, y, w, h);
    };

    const drawFrameFallback = () => {
      ctx.fillStyle = "#fde047";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(FRAME.x, FRAME.y, FRAME.w, FRAME.h);
    };

    const drawContent = () => {
      if (product?.image_url) {
        const pi = new Image();
        pi.crossOrigin = "anonymous";
        pi.onload = () => {
          drawProduct(pi);
          drawText();
        };
        pi.onerror = drawText;
        pi.src = product.image_url;
      } else drawText();
    };

    if (template?.image_url) {
      const bg = new Image();
      bg.crossOrigin = "anonymous";
      bg.onload = () => {
        ctx.drawImage(bg, 0, 0, W, H);
        drawContent();
      };
      bg.onerror = () => {
        drawFrameFallback();
        drawContent();
      };
      bg.src = template.image_url;
    } else {
      drawFrameFallback();
      drawContent();
    }
  }, [product, template]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error("Selecione um produto");
      const dataUrl = canvasRef.current!.toDataURL("image/png");
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
      toast.success("Story publicado");
      qc.invalidateQueries({ queryKey: ["ig-admin", "campaigns"] });
      qc.invalidateQueries({ queryKey: ["ig-admin", "stats"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao publicar"),
  });

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5">
      <h3 className="mb-4 text-sm font-semibold">Publicar Story a partir de um produto</h3>
      <div className="grid gap-4 lg:grid-cols-[1fr,220px]">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase text-muted-foreground">Produto</span>
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
            <span className="mb-1 block text-[10px] font-semibold uppercase text-muted-foreground">Template</span>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
            >
              {(templates.data ?? []).map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.is_default ? "★" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase text-muted-foreground">Palavra-chave</span>
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[10px] font-semibold uppercase text-muted-foreground">Mensagem DM</span>
              <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !productId}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Publicar Story
          </button>
        </div>

          <div className="flex flex-col items-center gap-2">
            <div className="overflow-hidden rounded-xl border border-border/60 bg-black/60 p-1">
              <canvas
                ref={canvasRef}
                style={{ width: 220, height: 391, display: "block" }}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                const url = canvasRef.current?.toDataURL("image/png");
                if (!url) return;
                const a = document.createElement("a");
                a.href = url;
                a.download = `story-${Date.now()}.png`;
                a.click();
              }}
              className="text-xs font-medium text-primary hover:underline"
            >
              Baixar arte gerada
            </button>
        </div>
      </div>
    </div>
  );
}

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function ScheduleCard({ templates }: { templates: any[] }) {
  const getFn = useServerFn(getAdminStorySchedule);
  const saveFn = useServerFn(saveAdminStorySchedule);
  const q = useQuery({ queryKey: ["ig-admin", "schedule"], queryFn: () => getFn() });

  const [days, setDays] = useState<number[]>([]);
  const [hours, setHours] = useState<number[]>([]);
  const [active, setActive] = useState(true);
  const [templateId, setTemplateId] = useState<string>("");

  useEffect(() => {
    if (q.data) {
      setDays(q.data.days ?? []);
      setHours(q.data.hours ?? []);
      setActive(q.data.active ?? true);
      setTemplateId(q.data.templateId ?? "");
    }
  }, [q.data]);

  const toggle = (arr: number[], set: (v: number[]) => void, v: number) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v].sort((a, b) => a - b));

  const mut = useMutation({
    mutationFn: () =>
      saveFn({ data: { days, hours, active, templateId: templateId || null } }),
    onSuccess: () => toast.success("Agendamento salvo"),
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        <header className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-3">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Agendamento Recorrente do Story</h3>
        </header>

        <div className="space-y-6 p-5">
          <section>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              📅 Dias da semana
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
              {WEEKDAYS.map((label, i) => (
                <label key={i} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={days.includes(i)}
                    onChange={() => toggle(days, setDays, i)}
                  />
                  <span className="relative inline-flex h-5 w-9 rounded-full bg-muted transition peer-checked:bg-primary">
                    <span className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
                  </span>
                  {label}
                </label>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              ⏰ Horários (hora cheia)
            </p>
            <div className="grid grid-cols-4 gap-x-6 gap-y-3 sm:grid-cols-6 lg:grid-cols-8">
              {Array.from({ length: 24 }, (_, h) => (
                <label key={h} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={hours.includes(h)}
                    onChange={() => toggle(hours, setHours, h)}
                  />
                  <span className="relative inline-flex h-5 w-9 rounded-full bg-muted transition peer-checked:bg-primary">
                    <span className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
                  </span>
                  {h}
                </label>
              ))}
            </div>
          </section>

          <section className="flex flex-wrap items-end gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              <span className="relative inline-flex h-5 w-9 rounded-full bg-muted transition peer-checked:bg-primary">
                <span className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
              </span>
              Ativo?
            </label>

            <label className="block flex-1 min-w-[220px]">
              <span className="mb-1 block text-[10px] font-semibold uppercase text-muted-foreground">
                Template
              </span>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
              >
                <option value="">— usar imagem do produto —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.is_default ? "★" : ""}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <button
            type="button"
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 via-rose-500 to-orange-400 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-95 disabled:opacity-50"
          >
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Agendamento
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          💡 <span>Dicas</span>
        </div>
        <ul className="space-y-2 text-xs text-muted-foreground">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            Contas do Instagram podem publicar até 25 posts automáticos por 24 horas.
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            O template do Story deve ter proporção 9:16 (1080×1920px).
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            Use o agendamento recorrente para manter seus stories ativos automaticamente.
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            Se o Instagram desconectar, reconecte usando 4G ao invés de Wi-Fi.
          </li>
        </ul>
      </div>
    </div>
  );
}

function Page() {
  const qc = useQueryClient();
  const listTemplates = useServerFn(listStoryTemplates);
  const templates = useQuery({ queryKey: ["ig-admin", "templates"], queryFn: () => listTemplates() });

  const refresh = () => qc.invalidateQueries({ queryKey: ["ig-admin", "templates"] });

  return (
    <InstagramLayout>
      <div className="space-y-6">
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Templates de Story</h2>
              <p className="text-xs text-muted-foreground">
                Envie sua arte 1080×1920, escolha as cores do título e do preço, salve. O sistema
                aplica automaticamente sobre a imagem do produto ao publicar.
              </p>
            </div>
          </div>
        </div>

        {templates.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando templates…
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {(templates.data ?? []).map((t: any) => (
              <TemplateCard key={t.id} template={t} onSaved={refresh} />
            ))}
            <TemplateCard onSaved={refresh} />
          </div>
        )}

        <PublishBox />

        <ScheduleCard templates={templates.data ?? []} />

      </div>
    </InstagramLayout>
  );
}

export const Route = createFileRoute("/instagram/stories")({
  head: () => ({
    meta: [
      { title: "Stories Instagram · DivulgaLinks" },
      { name: "description", content: "Upload de template, cores personalizadas e publicação de Stories automatizados." },
    ],
  }),
  component: Page,
});
