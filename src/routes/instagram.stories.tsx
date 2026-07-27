import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  deleteStoryTemplate,
  getAdminStorySchedule,
  getAdminStoryStatus,
  runAdminStoryScheduleNow,
  listInstagramProducts,
  listStoryTemplates,
  publishStoryCampaign,
  saveAdminStorySchedule,
  saveStoryTemplate,
  toggleAdminStoryAutomation,
} from "@/modules/instagram-admin/admin.functions";
import {
  STORY_W as W,
  STORY_H as H,
  PROD_ZONE,
  TITLE_ZONE,
  PRICE_BAR_ZONE,
  TITLE_LINE_HEIGHT,
  POR_FONT_SIZE,
  PRICE_FONT_SIZE_WITH_DE,
  PRICE_FONT_SIZE_NO_DE,
  DE_FONT_SIZE,
  DE_BASELINE_OFFSET,
  PRICE_CENTER_Y_OFFSET_WITH_DE,
  DE_STRIKE_WIDTH,
  DEFAULT_BG_COLOR,
  DEFAULT_TITLE_COLOR,
  wrapTitleLines,
} from "@/modules/instagram-admin/story-layout";
import { InstagramLayout } from "./instagram";
import { Activity, CalendarClock, CheckCircle2, ExternalLink, Image as ImageIcon, Loader2, Play, Power, Save, Send, Trash2, Upload } from "lucide-react";

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

  // Compose preview — respect the uploaded template EXACTLY.
  // We only overlay:
  //  · the product photo (inside the white area of the template)
  //  · the promo price (over the purple price bar of the template)
  // Nothing else is drawn (no extra frame, no CTA, no disclaimer, no title).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = W;
    canvas.height = H;

    // Zones/sizes come from the SHARED story-layout module — same source of
    // truth used by the server-side pureimage renderer (compose.server.ts).
    // Do NOT edit inline; change story-layout.ts instead so both paths stay
    // pixel-parity.
    const PROD = PROD_ZONE;
    const TITLE = TITLE_ZONE;
    const PRICE_BAR = PRICE_BAR_ZONE;

    const drawTitle = () => {
      const title = product?.title?.trim();
      if (!title) return;
      ctx.save();
      ctx.fillStyle = template?.title_color ?? DEFAULT_TITLE_COLOR;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const measure = (text: string, s: number) => {
        ctx.font = `800 ${s}px Inter, system-ui, sans-serif`;
        return ctx.measureText(text).width;
      };
      const { lines, size } = wrapTitleLines(title, measure);
      ctx.font = `800 ${size}px Inter, system-ui, sans-serif`;
      const lineH = size * TITLE_LINE_HEIGHT;
      const totalH = lineH * lines.length;
      const startY = TITLE.y + (TITLE.h - totalH) / 2 + lineH / 2;
      lines.forEach((ln, i) => ctx.fillText(ln, TITLE.x + TITLE.w / 2, startY + i * lineH));
      ctx.restore();
    };

    const drawPrice = () => {
      const promo = product?.promo_price ?? null;
      const original = product?.original_price ?? null;
      const hasDiscount =
        promo != null && original != null && Number(original) > Number(promo);
      const priceStr = formatBRL(promo ?? original);
      if (!priceStr) return;

      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";

      if (hasDiscount) {
        const deStr = `DE ${formatBRL(original)}`;
        ctx.font = `700 ${DE_FONT_SIZE}px Inter, system-ui, sans-serif`;
        const deY = PRICE_BAR.y + DE_BASELINE_OFFSET;
        ctx.fillText(deStr, PRICE_BAR.x + PRICE_BAR.w / 2, deY);
        const dw = ctx.measureText(deStr).width;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = DE_STRIKE_WIDTH;
        const sx = PRICE_BAR.x + (PRICE_BAR.w - dw) / 2;
        ctx.beginPath();
        ctx.moveTo(sx, deY);
        ctx.lineTo(sx + dw, deY);
        ctx.stroke();
      }

      const priceSize = hasDiscount ? PRICE_FONT_SIZE_WITH_DE : PRICE_FONT_SIZE_NO_DE;
      const porFont = `800 ${POR_FONT_SIZE}px Inter, system-ui, sans-serif`;
      const priceFont = `900 ${priceSize}px Inter, system-ui, sans-serif`;
      ctx.font = porFont;
      const porW = ctx.measureText("POR ").width;
      ctx.font = priceFont;
      const priceW = ctx.measureText(priceStr).width;
      const totalW = porW + priceW;
      const startX = PRICE_BAR.x + (PRICE_BAR.w - totalW) / 2;
      const centerY = hasDiscount
        ? PRICE_BAR.y + PRICE_BAR.h + PRICE_CENTER_Y_OFFSET_WITH_DE
        : PRICE_BAR.y + PRICE_BAR.h / 2;

      ctx.textAlign = "left";
      ctx.font = porFont;
      ctx.fillText("POR", startX, centerY);
      ctx.font = priceFont;
      ctx.fillText(priceStr, startX + porW, centerY);
      ctx.restore();
    };


    const drawProduct = (img: HTMLImageElement) => {
      const ratio = Math.min(PROD.w / img.width, PROD.h / img.height);
      const w = img.width * ratio;
      const h = img.height * ratio;
      const x = PROD.x + (PROD.w - w) / 2;
      const y = PROD.y + (PROD.h - h) / 2;
      ctx.drawImage(img, x, y, w, h);
    };

    const drawContent = () => {
      if (product?.image_url) {
        const pi = new Image();
        pi.crossOrigin = "anonymous";
        pi.onload = () => {
          drawProduct(pi);
          drawTitle();
          drawPrice();
        };
        pi.onerror = () => {
          drawTitle();
          drawPrice();
        };
        // Route external images through the proxy so CORS is honored
        // and the canvas stays exportable (toDataURL won't throw).
        const src: string = product.image_url;
        const isSameOrigin = typeof window !== "undefined" && src.startsWith(window.location.origin);
        const isData = src.startsWith("data:");
        pi.src = isSameOrigin || isData ? src : `/api/public/img-proxy?url=${encodeURIComponent(src)}`;
      } else {
        drawTitle();
        drawPrice();
      }
    };



    if (template?.image_url) {
      const bg = new Image();
      bg.crossOrigin = "anonymous";
      bg.onload = () => {
        ctx.drawImage(bg, 0, 0, W, H);
        drawContent();
      };
      bg.onerror = () => {
        ctx.fillStyle = DEFAULT_BG_COLOR;
        ctx.fillRect(0, 0, W, H);
        drawContent();
      };
      bg.src = template.image_url;
    } else {
      ctx.fillStyle = DEFAULT_BG_COLOR;
      ctx.fillRect(0, 0, W, H);
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
  const qc = useQueryClient();
  const getFn = useServerFn(getAdminStorySchedule);
  const saveFn = useServerFn(saveAdminStorySchedule);
  const runNowFn = useServerFn(runAdminStoryScheduleNow);
  const toggleFn = useServerFn(toggleAdminStoryAutomation);
  const statusFn = useServerFn(getAdminStoryStatus);
  const q = useQuery({ queryKey: ["ig-admin", "schedule"], queryFn: () => getFn() });
  const statusQ = useQuery({
    queryKey: ["ig-admin", "story-status"],
    queryFn: () => statusFn(),
    refetchInterval: 15_000,
  });

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
    onSuccess: () => {
      toast.success("Agendamento salvo");
      qc.invalidateQueries({ queryKey: ["ig-admin", "story-status"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  const powerMut = useMutation({
    mutationFn: (next: boolean) => toggleFn({ data: { active: next } }),
    onSuccess: (r: any) => {
      setActive(!!r?.active);
      toast.success(r?.active ? "Automação ATIVADA" : "Automação PAUSADA");
      qc.invalidateQueries({ queryKey: ["ig-admin", "schedule"] });
      qc.invalidateQueries({ queryKey: ["ig-admin", "story-status"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao alternar"),
  });

  const runNow = useMutation({
    mutationFn: () => runNowFn(),
    onSuccess: (r: any) => {
      toast.success(`Story publicado! ${r?.productTitle ? `— ${r.productTitle}` : ""}`);
      qc.invalidateQueries({ queryKey: ["ig-admin", "story-status"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao publicar"),
  });

  const status = statusQ.data;
  const fmt = (iso?: string | null) =>
    iso
      ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
      : "—";

  return (
    <div className="space-y-4">
      {/* BIG ON/OFF BUTTON */}
      <div
        className={`overflow-hidden rounded-2xl border-2 shadow-lg transition ${
          active
            ? "border-emerald-400/70 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent"
            : "border-rose-400/60 bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent"
        }`}
      >
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`relative flex h-3 w-3 ${active ? "" : "opacity-60"}`}
              aria-hidden
            >
              {active && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex h-3 w-3 rounded-full ${
                  active ? "bg-emerald-500" : "bg-rose-500"
                }`}
              />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Automação de Stories
              </p>
              <p className={`text-lg font-bold ${active ? "text-emerald-600" : "text-rose-600"}`}>
                {active ? "ATIVA — publicando nos horários" : "PAUSADA — nada será publicado"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => powerMut.mutate(!active)}
            disabled={powerMut.isPending}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white shadow-md transition disabled:opacity-50 ${
              active
                ? "bg-rose-500 hover:bg-rose-600"
                : "bg-emerald-500 hover:bg-emerald-600"
            }`}
          >
            {powerMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Power className="h-4 w-4" />
            )}
            {active ? "Desativar automação" : "Ativar automação"}
          </button>
        </div>
      </div>

      {/* LIVE STATUS */}
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        <header className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Status ao vivo</h3>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {statusQ.isFetching ? "atualizando…" : "atualiza a cada 15s"}
          </span>
        </header>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
          <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Status</p>
            <p className={`mt-1 text-sm font-bold ${active ? "text-emerald-600" : "text-rose-600"}`}>
              {active ? "🟢 Automação ativa" : "🔴 Pausada"}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Próxima publicação</p>
            <p className="mt-1 text-sm font-semibold">{active ? fmt(status?.nextRunAt) : "—"}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Última execução</p>
            <p className="mt-1 text-sm font-semibold">{fmt(status?.lastRunAt)}</p>
          </div>
        </div>
        <div className="border-t border-border/60 px-5 py-4">
          <p className="mb-3 text-[10px] font-semibold uppercase text-muted-foreground">
            📜 Últimos stories publicados
          </p>
          {!status?.recent?.length ? (
            <p className="text-xs text-muted-foreground">Nenhuma publicação ainda.</p>
          ) : (
            <ul className="space-y-2">
              {status.recent.slice(0, 6).map((r: any) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs"
                >
                  {r.productImage ? (
                    <img
                      src={r.productImage}
                      alt=""
                      className="h-10 w-10 flex-shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 flex-shrink-0 rounded bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.productTitle ?? "(sem título)"}</p>
                    <p className="text-[10px] text-muted-foreground">{fmt(r.publishedAt)}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      r.status === "published" || r.status === "sent"
                        ? "bg-emerald-500/15 text-emerald-600"
                        : r.status === "failed" || r.error
                        ? "bg-rose-500/15 text-rose-600"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

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

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => mut.mutate()}
              disabled={mut.isPending}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 via-rose-500 to-orange-400 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-95 disabled:opacity-50"
            >
              {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar Agendamento
            </button>
            <button
              type="button"
              onClick={() => runNow.mutate()}
              disabled={runNow.isPending}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-5 py-3 text-sm font-semibold text-primary shadow-sm transition hover:bg-primary/20 disabled:opacity-50"
              title="Publica agora um Story com as mesmas regras do agendamento (template + produto com desconto prioritário)"
            >
              {runNow.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Publicar agora
            </button>
          </div>
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
            {(templates.data ?? []).length > 0 ? (
              <TemplateCard
                key={(templates.data ?? [])[0].id}
                template={(templates.data ?? [])[0]}
                onSaved={refresh}
              />
            ) : (
              <TemplateCard onSaved={refresh} />
            )}
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
