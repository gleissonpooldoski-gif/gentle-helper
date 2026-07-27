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
  header: "<b>🚨 OFERTA RELÂMPAGO!!</b>",
  header_mode: "auto",
  title_template: "🔥🔥 <b>{title}</b> 🔥🔥",
  upper_title: true,
  hide_sales: false,
  sales_template: "🛒 <i>{vendas} vendidos</i> 🛒",
  description_template: "{description}",
  hide_original: false,
  original_price_template: "❌❌ <s>{price_original}</s> ❌❌",
  installment_template: "💳💳 {parcelamento} 💳💳",
  price_template: "💵💵 <b>{price}</b> 💵💵",
  link_template: "🔗 COMPRE AQUI:\n{link}",
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

/**
 * Retorna true apenas quando o valor de vendas é > 0.
 * Aceita formatos "1,5 mil", "6mil", "1.234", "500", "0", "0 vendidos".
 */
function hasRealSales(v: string | null | undefined): boolean {
  if (!v) return false;
  const s = String(v).toLowerCase().trim();
  if (!s || s === "0") return false;
  const cleaned = s.replace(/vendid[oa]s?/g, "").trim();
  const mulMatch = cleaned.match(/([\d.,]+)\s*(mil|mi|milh[aã]o|milh[oõ]es|k|m)?/i);
  if (!mulMatch) return false;
  const num = Number(mulMatch[1].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(num) || num <= 0) return false;
  return true;
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
    vendas: product.vendas != null
      ? String(product.vendas).replace(/\s*vendid[oa]s?\s*$/i, "").trim()
      : "",
    link: product.link,
    store: product.store ?? "",
    category: product.category ?? "",
    image: product.image ?? "",
    discount: product.discount != null ? String(product.discount) : "",
  };

  // [DEBUG TEMPORÁRIO] rastreio de vendas/preço por produto renderizado
  try {
    console.log("[render-post:debug]", {
      title: product.title,
      raw_price: product.price,
      raw_price_original: product.price_original,
      effective_price: effectivePrice,
      effective_original: effectiveOriginal,
      raw_vendas: product.vendas,
      vendas_final: vars.vendas,
    });
  } catch { /* noop */ }

  const blocks: string[] = [];
  if (layout.header) blocks.push(layout.header);
  if (layout.title_template) blocks.push(fill(layout.title_template, vars));
  if (!layout.hide_sales && hasRealSales(vars.vendas) && layout.sales_template) {
    blocks.push(fill(layout.sales_template, vars));
  }

  if (vars.description && layout.description_template) {
    blocks.push(fill(layout.description_template, vars));
  }
  // LOTE 18A: NÃO recomputar desconto aqui. `price_original` só chega preenchido
  // quando resolveProductDisplay aprovou (price_quality=HIGH). Renderer é passivo.
  const showOriginal =
    !layout.hide_original &&
    !!vars.price_original &&
    !!vars.price;
  if (showOriginal && layout.original_price_template) {
    blocks.push(fill(layout.original_price_template, vars));
  }
  if (vars.parcelamento && layout.installment_template) {
    blocks.push(fill(layout.installment_template, vars));
  }
  if (vars.price && layout.price_template) {
    blocks.push(fill(layout.price_template, vars));
  }
  // Regra: nunca calcular ou exibir percentual de desconto automaticamente.
  // O "DE:" (preço original riscado) já é exibido acima quando há preço maior real;
  // qualquer selo de OFF/oportunidade fica a cargo do template visual do canal.


  if (vars.link && layout.link_template) {
    blocks.push(fill(layout.link_template, vars));
  }
  if (layout.footer) blocks.push(layout.footer);

  const joined = blocks.join("\n\n");
  return channel === "whatsapp" ? htmlToWhatsApp(joined) : joined;
}
