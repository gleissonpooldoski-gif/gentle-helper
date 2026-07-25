// Fabric.js canvas helpers for the visual template editor.
// Runs only in the browser — import through <ClientOnly> boundaries.
import * as fabric from "fabric";
import type { VTElement, VTFormat } from "./presets";
import { FORMAT_SIZE } from "./presets";
import { resolveProduct, SAMPLE, type ProductLite } from "./bindings";

const uid = () => Math.random().toString(36).slice(2, 10);

type FabricObj = fabric.Object & { data?: { id: string; type: VTElement["type"]; props: Record<string, unknown> } };

function makePricePlate(el: VTElement, resolved: ReturnType<typeof resolveProduct>): fabric.Group {
  const p = el.props as Record<string, unknown>;
  const bg = (p.bg as string) || "#dc2626";
  const color = (p.color as string) || "#ffffff";
  const mode = (p.mode as string) || "both";
  const radius = (p.radius as number) ?? 24;

  const rect = new fabric.Rect({
    left: 0,
    top: 0,
    width: el.w,
    height: el.h,
    fill: bg,
    rx: radius,
    ry: radius,
  });

  const objs: fabric.Object[] = [rect];

  if (mode !== "por" && resolved.hasOriginal) {
    const de = new fabric.Text(`DE ${resolved.original}`, {
      left: el.w / 2,
      top: 24,
      originX: "center",
      fontSize: 40,
      fontWeight: 700,
      fill: color,
      fontFamily: "Inter",
      linethrough: true,
    });
    objs.push(de);
  }
  const porLabel = new fabric.Text("POR", {
    left: 60,
    top: resolved.hasOriginal && mode !== "por" ? el.h - 130 : el.h / 2 - 50,
    fontSize: 52,
    fontWeight: 800,
    fill: color,
    fontFamily: "Inter",
  });
  const price = new fabric.Text(resolved.price, {
    left: 200,
    top: resolved.hasOriginal && mode !== "por" ? el.h - 150 : el.h / 2 - 60,
    fontSize: 96,
    fontWeight: 900,
    fill: color,
    fontFamily: "Inter",
  });
  objs.push(porLabel, price);

  return new fabric.Group(objs, { left: el.x, top: el.y, selectable: true });
}

async function makeImage(el: VTElement, src: string): Promise<fabric.Object> {
  const img = await fabric.FabricImage.fromURL(src, { crossOrigin: "anonymous" }).catch(() => null);
  if (!img) {
    return new fabric.Rect({
      left: el.x,
      top: el.y,
      width: el.w,
      height: el.h,
      fill: "#e5e7eb",
      stroke: "#9ca3af",
      strokeDashArray: [6, 6],
    });
  }
  const scale = Math.min(el.w / (img.width ?? 1), el.h / (img.height ?? 1));
  img.set({ left: el.x, top: el.y, scaleX: scale, scaleY: scale });
  return img;
}

function textFor(el: VTElement, resolved: ReturnType<typeof resolveProduct>): string {
  const bind = (el.props as { bind?: string; text?: string }).bind;
  const rawText = (el.props as { text?: string }).text ?? "";
  if (!bind) return rawText || "Texto";
  return {
    "{{title}}": resolved.title,
    "{{price}}": resolved.price,
    "{{original_price}}": resolved.original,
    "{{discount}}": resolved.discount,
    "{{sold_text}}": resolved.sold,
    "{{store}}": resolved.store,
  }[bind] ?? rawText;
}

export async function renderElement(el: VTElement, product?: ProductLite | null): Promise<fabric.Object | null> {
  const resolved = product ? resolveProduct(product) : SAMPLE;
  const common = { data: { id: el.id, type: el.type, props: el.props } };
  switch (el.type) {
    case "background": {
      const bg = new fabric.Rect({
        left: el.x,
        top: el.y,
        width: el.w,
        height: el.h,
        fill: (el.props.fill as string) ?? "#ffffff",
        selectable: false,
        evented: false,
      });
      Object.assign(bg, common);
      return bg;
    }
    case "shape": {
      const r = new fabric.Rect({
        left: el.x,
        top: el.y,
        width: el.w,
        height: el.h,
        fill: (el.props.fill as string) ?? "#ffffff",
        rx: (el.props.radius as number) ?? 0,
        ry: (el.props.radius as number) ?? 0,
      });
      Object.assign(r, common);
      return r;
    }
    case "product_image": {
      const src = resolved.image_url;
      const o = src ? await makeImage(el, src) : new fabric.Rect({
        left: el.x, top: el.y, width: el.w, height: el.h,
        fill: "#f3f4f6", stroke: "#9ca3af", strokeDashArray: [8, 8],
      });
      Object.assign(o, common);
      return o;
    }
    case "logo":
    case "image": {
      const src = (el.props.src as string) || "";
      const o = src ? await makeImage(el, src) : new fabric.Rect({
        left: el.x, top: el.y, width: el.w, height: el.h,
        fill: "#eef2ff", stroke: "#818cf8", strokeDashArray: [6, 6],
      });
      Object.assign(o, common);
      return o;
    }
    case "price": {
      const g = makePricePlate(el, resolved);
      Object.assign(g, common);
      return g;
    }
    case "discount": {
      const t = new fabric.Text(resolved.discount || "-20%", {
        left: el.x, top: el.y,
        fontSize: (el.props.size as number) ?? 72,
        fontWeight: 900,
        fill: (el.props.color as string) ?? "#dc2626",
        fontFamily: (el.props.font as string) ?? "Bebas Neue",
      });
      Object.assign(t, common);
      return t;
    }
    case "sold":
    case "store":
    case "rating":
    case "buy_button":
    case "free_text":
    case "text": {
      const label = textFor(el, resolved);
      const t = new fabric.Textbox(label, {
        left: el.x,
        top: el.y,
        width: el.w,
        fontSize: (el.props.size as number) ?? 40,
        fontWeight: (el.props.weight as number) ?? 700,
        fill: (el.props.color as string) ?? "#111111",
        fontFamily: (el.props.font as string) ?? "Inter",
        textAlign: (el.props.align as string) ?? "left",
      });
      Object.assign(t, common);
      return t;
    }
  }
}

export async function loadElements(
  canvas: fabric.Canvas,
  elements: VTElement[],
  product?: ProductLite | null,
) {
  canvas.clear();
  canvas.backgroundColor = "#ffffff";
  const sorted = [...elements].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  for (const el of sorted) {
    const obj = await renderElement(el, product);
    if (obj) canvas.add(obj);
  }
  canvas.renderAll();
}

export function serializeCanvas(canvas: fabric.Canvas, format: VTFormat): VTElement[] {
  const objs = canvas.getObjects() as FabricObj[];
  return objs.map((o, i) => {
    const data = o.data ?? { id: uid(), type: "shape" as const, props: {} };
    const w = (o.width ?? 100) * (o.scaleX ?? 1);
    const h = (o.height ?? 100) * (o.scaleY ?? 1);
    return {
      id: data.id,
      type: data.type,
      x: Math.round(o.left ?? 0),
      y: Math.round(o.top ?? 0),
      w: Math.round(w),
      h: Math.round(h),
      rotation: o.angle ?? 0,
      z: i,
      props: data.props ?? {},
    };
  });
}

export function newElement(type: VTElement["type"], format: VTFormat): VTElement {
  const { w, h } = FORMAT_SIZE[format];
  const defaults: Record<VTElement["type"], Partial<VTElement>> = {
    background: { x: 0, y: 0, w, h, props: { fill: "#ffffff" } },
    shape: { x: w / 2 - 200, y: h / 2 - 100, w: 400, h: 200, props: { fill: "#7c3aed", radius: 16 } },
    image: { x: w / 2 - 200, y: h / 2 - 200, w: 400, h: 400, props: { src: "" } },
    product_image: { x: w / 2 - 350, y: 200, w: 700, h: 700, props: { fit: "contain" } },
    logo: { x: 60, y: 60, w: 200, h: 200, props: { src: "" } },
    text: { x: 100, y: 200, w: w - 200, h: 100, props: { text: "Novo texto", font: "Inter", size: 60, weight: 700, color: "#111111", align: "center" } },
    price: { x: 60, y: h - 300, w: w - 120, h: 220, props: { mode: "both", bg: "#dc2626", color: "#ffffff", radius: 24 } },
    discount: { x: w - 260, y: 80, w: 200, h: 200, props: { size: 100, color: "#dc2626", font: "Bebas Neue" } },
    rating: { x: 100, y: 300, w: 400, h: 60, props: { text: "⭐⭐⭐⭐⭐ 4.8", font: "Inter", size: 40, color: "#111111", align: "left" } },
    sold: { x: 100, y: 300, w: 500, h: 60, props: { bind: "{{sold_text}}", font: "Inter", size: 40, color: "#111111", align: "left" } },
    store: { x: 100, y: 360, w: 500, h: 60, props: { bind: "{{store}}", font: "Inter", size: 36, color: "#374151", align: "left" } },
    buy_button: { x: 120, y: h - 200, w: w - 240, h: 140, props: { text: "COMPRAR AGORA", font: "Inter", size: 56, weight: 800, color: "#ffffff", align: "center" } },
    free_text: { x: 100, y: 200, w: w - 200, h: 100, props: { text: "Texto livre", font: "Inter", size: 48, color: "#111111", align: "center" } },
  };
  const d = defaults[type];
  return {
    id: uid(),
    type,
    x: (d.x as number) ?? 100,
    y: (d.y as number) ?? 100,
    w: (d.w as number) ?? 200,
    h: (d.h as number) ?? 100,
    z: Date.now() % 100000,
    props: (d.props as Record<string, unknown>) ?? {},
  };
}
