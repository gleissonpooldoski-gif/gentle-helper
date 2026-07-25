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
  header: "🚨 <b>OFERTA RELÂMPAGO!!</b>",
  header_mode: "custom",
  title_template: "🔥🔥 <b>{title}</b> 🔥🔥",
  upper_title: true,
  hide_sales: false,
  sales_template: "🛒 <i>{vendas} vendidos</i> 🛒",
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
  // Fallback: quando só existe um dos preços, usa-o como preço atual.
  // Evita post sem linha de preço quando promo_price está null mas
  // original_price está preenchido (caso comum na captura Shopee).
  const effectivePrice =
    product.price != null && product.price !== ""
      ? product.price
      : product.price_original ?? null;
  const effectiveOriginal =
    product.price != null && product.price !== "" ? product.price_original ?? null : null;
  const vars = {
    title,
    description: product.description ?? "",
    price: money(effectivePrice),
    price_original: money(effectiveOriginal),
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
  // Sempre exibe a linha "DE:" (riscada) quando o preço original foi capturado
  // e é diferente do promocional. O fallback acima garante que price_original
  // só está preenchido quando existe um preço original real, distinto do atual.
  const originalNum = Number(String(product.price_original ?? "").replace(/[^\d.,-]/g, "").replace(",", "."));
  const promoNum = Number(String(product.price ?? "").replace(/[^\d.,-]/g, "").replace(",", "."));
  const hasRealDiscount =
    Number.isFinite(originalNum) &&
    Number.isFinite(promoNum) &&
    originalNum > promoNum;
  const showOriginal =
    !layout.hide_original &&
    !!vars.price_original &&
    !!vars.price &&
    hasRealDiscount;
  if (showOriginal && layout.original_price_template) {
    blocks.push(fill(layout.original_price_template, vars));
  }
  if (vars.parcelamento && layout.installment_template) {
    blocks.push(fill(layout.installment_template, vars));
  }
  if (vars.price && layout.price_template) {
    blocks.push(fill(layout.price_template, vars));
  }
  // Linha de "% OFF" — só quando há desconto real.
  // Prioriza o discount vindo do produto (calculado na captura); calcula on-the-fly quando ausente.
  let discountPct: number | null = null;
  if (product.discount != null && String(product.discount) !== "") {
    const d = Number(String(product.discount).replace(/[^\d.-]/g, ""));
    if (Number.isFinite(d) && d > 0) discountPct = Math.round(d);
  } else if (hasRealDiscount) {
    discountPct = Math.round(((originalNum - promoNum) / originalNum) * 100);
  }
  if (discountPct != null && discountPct > 0 && hasRealDiscount) {
    blocks.push(`🔥 <b>${discountPct}% OFF</b> 🔥`);
  }

  if (vars.link && layout.link_template) {
    blocks.push(fill(layout.link_template, vars));
  }
  if (layout.footer) blocks.push(layout.footer);

  const joined = blocks.join("\n\n");
  return channel === "whatsapp" ? htmlToWhatsApp(joined) : joined;
}
