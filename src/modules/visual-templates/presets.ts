// Preset element libraries for the visual template editor.
// Each preset returns an initial `elements` array for a given format.

export type VTFormat = "ig_story" | "ig_post" | "whatsapp";

export interface VTElement {
  id: string;
  type:
    | "background"
    | "shape"
    | "image"
    | "product_image"
    | "logo"
    | "text"
    | "price"
    | "discount"
    | "rating"
    | "sold"
    | "store"
    | "buy_button"
    | "free_text";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  z?: number;
  props: Record<string, unknown>;
}

export const FORMAT_SIZE: Record<VTFormat, { w: number; h: number }> = {
  ig_story: { w: 1080, h: 1920 },
  ig_post: { w: 1080, h: 1080 },
  whatsapp: { w: 1080, h: 1350 },
};

const uid = () => Math.random().toString(36).slice(2, 10);

function blank(format: VTFormat): VTElement[] {
  const { w, h } = FORMAT_SIZE[format];
  return [
    {
      id: uid(),
      type: "background",
      x: 0,
      y: 0,
      w,
      h,
      z: 0,
      props: { fill: "#ffffff" },
    },
  ];
}

function ofertaRelampago(format: VTFormat): VTElement[] {
  const { w, h } = FORMAT_SIZE[format];
  const frameH = format === "ig_post" ? 640 : format === "whatsapp" ? 820 : 1100;
  const frameY = format === "ig_post" ? 100 : format === "whatsapp" ? 180 : 340;
  return [
    { id: uid(), type: "background", x: 0, y: 0, w, h, z: 0, props: { fill: "#fde047" } },
    {
      id: uid(),
      type: "text",
      x: 60,
      y: 80,
      w: w - 120,
      h: 90,
      z: 2,
      props: {
        text: "⚡ OFERTA RELÂMPAGO",
        font: "Bebas Neue",
        size: 84,
        weight: 700,
        color: "#111111",
        align: "center",
      },
    },
    { id: uid(), type: "shape", x: 60, y: frameY - 20, w: w - 120, h: frameH + 40, z: 1,
      props: { fill: "#ffffff", radius: 24 } },
    { id: uid(), type: "product_image", x: 120, y: frameY, w: w - 240, h: frameH - 260, z: 3,
      props: { fit: "contain", radius: 12 } },
    { id: uid(), type: "text", x: 100, y: frameY + frameH - 240, w: w - 200, h: 120, z: 4,
      props: { bind: "{{title}}", font: "Inter", size: 52, weight: 800, color: "#111111", align: "center" } },
    { id: uid(), type: "price", x: 60, y: frameY + frameH + 80, w: w - 120, h: 220, z: 5,
      props: { mode: "both", bg: "#dc2626", color: "#ffffff", radius: 28 } },
  ];
}

function shopeePreset(format: VTFormat): VTElement[] {
  const els = ofertaRelampago(format);
  (els[0] as VTElement).props = { fill: "#ee4d2d" };
  (els[1] as VTElement).props = {
    ...(els[1] as VTElement).props,
    text: "🛒 ACHADO SHOPEE",
    color: "#ffffff",
  };
  const price = els[els.length - 1] as VTElement;
  price.props = { ...price.props, bg: "#f97316" };
  return els;
}

function blackFriday(format: VTFormat): VTElement[] {
  const els = ofertaRelampago(format);
  (els[0] as VTElement).props = { fill: "#000000" };
  (els[1] as VTElement).props = {
    ...(els[1] as VTElement).props,
    text: "🔥 BLACK FRIDAY",
    color: "#facc15",
    font: "Anton",
  };
  const price = els[els.length - 1] as VTElement;
  price.props = { ...price.props, bg: "#facc15", color: "#000000" };
  return els;
}

function cupom(format: VTFormat): VTElement[] {
  const els = ofertaRelampago(format);
  (els[0] as VTElement).props = { fill: "#7c3aed" };
  (els[1] as VTElement).props = {
    ...(els[1] as VTElement).props,
    text: "🎟 CUPOM EXCLUSIVO",
    color: "#ffffff",
  };
  return els;
}

function superOferta(format: VTFormat): VTElement[] {
  const els = ofertaRelampago(format);
  (els[0] as VTElement).props = { fill: "#0ea5e9" };
  (els[1] as VTElement).props = { ...(els[1] as VTElement).props, text: "💥 SUPER OFERTA", color: "#ffffff" };
  return els;
}

function achadinhos(format: VTFormat): VTElement[] {
  const els = ofertaRelampago(format);
  (els[0] as VTElement).props = { fill: "#f472b6" };
  (els[1] as VTElement).props = { ...(els[1] as VTElement).props, text: "✨ ACHADINHOS", color: "#ffffff" };
  return els;
}

function viral(format: VTFormat): VTElement[] {
  const els = ofertaRelampago(format);
  (els[0] as VTElement).props = { fill: "#111827" };
  (els[1] as VTElement).props = { ...(els[1] as VTElement).props, text: "🚀 PRODUTO VIRAL", color: "#22d3ee", font: "Anton" };
  return els;
}

export const PRESETS: Record<string, (format: VTFormat) => VTElement[]> = {
  blank,
  oferta_relampago: ofertaRelampago,
  shopee: shopeePreset,
  black_friday: blackFriday,
  cupom,
  super_oferta: superOferta,
  achadinhos,
  viral,
};

export const PRESET_LABELS: { id: keyof typeof PRESETS; label: string; hint: string }[] = [
  { id: "blank", label: "Em branco", hint: "Comece do zero" },
  { id: "oferta_relampago", label: "Oferta Relâmpago", hint: "Amarelo + vermelho" },
  { id: "shopee", label: "Shopee", hint: "Laranja Shopee" },
  { id: "black_friday", label: "Black Friday", hint: "Preto + amarelo" },
  { id: "cupom", label: "Cupom", hint: "Roxo com selo" },
  { id: "super_oferta", label: "Super Oferta", hint: "Azul vibrante" },
  { id: "achadinhos", label: "Achadinhos", hint: "Rosa suave" },
  { id: "viral", label: "Produto Viral", hint: "Preto neon" },
];
