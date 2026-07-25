/**
 * Renderer compartilhado do "Post/Layout".
 * Instagram, Facebook, YouTube e WhatsApp usam esta mesma função:
 * alterar o template no SaaS reflete em todos os canais automaticamente.
 */

export type HeaderMode = "auto" | "custom";

export interface PostLayout {
  header: string;
  header_mode: HeaderMode;
  title_template: string;
  upper_title: boolean;
  hide_sales: boolean;
  sales_template: string;
  description_template: string;
  hide_original: boolean;
  original_price_template: string;
  installment_template: string;
  price_template: string;
  link_template: string;
  footer: string;
}

export const DEFAULT_POST_LAYOUT: PostLayout = {
  header: "🚨 OFERTA RELÂMPAGO!!",
  header_mode: "custom",
  title_template: "🔥🔥 <b>{title}</b> 🔥🔥",
  upper_title: true,
  hide_sales: false,
  sales_template: "🛒 <i>{vendas} pedidos</i> 🛒",
  description_template: "<pre>{description}</pre>",
  hide_original: false,
  original_price_template: "❌❌ <s>{price_original}</s> ❌❌",
  installment_template: "💳💳 {parcelamento} 💳💳",
  price_template: "💵💵 <b>{price}</b> 💵💵",
  link_template: "🔗COMPRE AQUI {link}",
  footer: "🚨 Promoção sujeita a alteração a qualquer momento!",
};

export interface PostProduct {
  title: string;
  description?: string | null;
  price?: string | number | null;         // preço promocional
  price_original?: string | number | null;
  parcelamento?: string | null;
  vendas?: number | string | null;
  link: string;
  image?: string | null;
  store?: string | null;
  category?: string | null;
  discount?: string | number | null;
}

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function money(v: string | number | null | undefined): string {
  if (v == null || v === "") return "";
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.,-]/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return String(v);
  return BRL.format(n);
}

function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
}

/** Converte tags HTML do template para markdown do WhatsApp. */
function htmlToWhatsApp(s: string): string {
  return s
    .replace(/<\/?\s*b\s*>/gi, "*")
    .replace(/<\/?\s*strong\s*>/gi, "*")
    .replace(/<\/?\s*i\s*>/gi, "_")
    .replace(/<\/?\s*em\s*>/gi, "_")
    .replace(/<\/?\s*s\s*>/gi, "~")
    .replace(/<\/?\s*strike\s*>/gi, "~")
    .replace(/<\/?\s*del\s*>/gi, "~")
    .replace(/<\/?\s*pre\s*>/gi, "```")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");
}

/**
 * Renderiza o "post final" a partir do layout e do produto.
 * `channel="whatsapp"` converte HTML para markdown do WhatsApp.
 */
export function renderPost(
  layout: PostLayout,
  product: PostProduct,
  channel: "whatsapp" | "html" = "html",
): string {
  const title = layout.upper_title ? product.title.toUpperCase() : product.title;
  const vars = {
    title,
    description: product.description ?? "",
    price: money(product.price),
    price_original: money(product.price_original),
    parcelamento: product.parcelamento ?? "",
    vendas: product.vendas != null ? String(product.vendas) : "",
    link: product.link,
    store: product.store ?? "",
    category: product.category ?? "",
    image: product.image ?? "",
    discount: product.discount != null ? String(product.discount) : "",
  };

  const blocks: string[] = [];
  if (layout.header) blocks.push(layout.header);
  if (layout.title_template) blocks.push(fill(layout.title_template, vars));
  if (!layout.hide_sales && vars.vendas && layout.sales_template) {
    blocks.push(fill(layout.sales_template, vars));
  }
  if (vars.description && layout.description_template) {
    blocks.push(fill(layout.description_template, vars));
  }
  if (!layout.hide_original && vars.price_original && layout.original_price_template) {
    blocks.push(fill(layout.original_price_template, vars));
  }
  if (vars.parcelamento && layout.installment_template) {
    blocks.push(fill(layout.installment_template, vars));
  }
  if (vars.price && layout.price_template) {
    blocks.push(fill(layout.price_template, vars));
  }
  if (vars.link && layout.link_template) {
    blocks.push(fill(layout.link_template, vars));
  }
  if (layout.footer) blocks.push(layout.footer);

  const joined = blocks.join("\n\n");
  return channel === "whatsapp" ? htmlToWhatsApp(joined) : joined;
}
