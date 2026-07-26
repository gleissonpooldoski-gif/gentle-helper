/**
 * Price Quality Engine — Shopee
 *
 * Camada de decisão para exibição de preço "DE/POR" nos posts.
 * Não altera preços persistidos; apenas classifica se é seguro
 * mostrar comparação de preço no momento da publicação.
 */

export type PriceQuality = "HIGH" | "MEDIUM" | "LOW" | "BLOCKED";

export interface PriceQualityInput {
  title?: string | null;
  promo_price?: number | string | null;
  original_price?: number | string | null;
  platform?: string | null;
}

export interface PriceQualityResult {
  quality: PriceQuality;
  showComparison: boolean;
  reason: string;
  effectiveOriginal: number | null;
  effectivePromo: number;
}

const VARIANT_TERMS = [
  "kit",
  "combo",
  "pacote",
  "unidades",
  "unidade",
  "peças",
  "pecas",
  "peca",
  "peça",
  "tamanho",
  "cor ",
  "modelo",
  "conjunto",
  "atacado",
];

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function hasVariantTerm(title: string): boolean {
  const t = title.toLowerCase();
  return VARIANT_TERMS.some((term) => t.includes(term));
}

/**
 * Classifica a qualidade do preço do produto Shopee para exibição.
 */
export function classifyShopeePriceQuality(product: PriceQualityInput): PriceQualityResult {
  const title = String(product.title ?? "");
  const promo = toNum(product.promo_price);
  const original = toNum(product.original_price);

  // Sem preço promocional válido — não há o que exibir.
  if (promo == null) {
    return {
      quality: "BLOCKED",
      showComparison: false,
      reason: "missing_promo_price",
      effectiveOriginal: null,
      effectivePromo: 0,
    };
  }

  const variantHit = hasVariantTerm(title);

  // Sem preço original ou original <= promo → MEDIUM (mostra só o promo).
  if (original == null || original <= promo) {
    return {
      quality: "MEDIUM",
      showComparison: false,
      reason: original == null ? "missing_original_price" : "original_le_promo",
      effectiveOriginal: null,
      effectivePromo: promo,
    };
  }

  const discountPct = ((original - promo) / original) * 100;
  const ratio = original / promo;

  // BLOCKED: desconto absurdo (>90%) ou variação + multiplicador ≥ 5×
  if (discountPct > 90 || (variantHit && ratio >= 5)) {
    return {
      quality: "BLOCKED",
      showComparison: false,
      reason: variantHit ? "possible_variant_price_mismatch" : "extreme_discount",
      effectiveOriginal: null,
      effectivePromo: promo,
    };
  }

  // BLOCKED: variação + desconto forte (>70%) — kit vs unidade típico
  if (variantHit && discountPct > 70) {
    return {
      quality: "BLOCKED",
      showComparison: false,
      reason: "possible_variant_price_mismatch",
      effectiveOriginal: null,
      effectivePromo: promo,
    };
  }

  // LOW: desconto entre 80% e 90% OU (variação + desconto 50-70%)
  if (discountPct > 80 || (variantHit && discountPct > 50)) {
    return {
      quality: "LOW",
      showComparison: false,
      reason: variantHit ? "variant_term_with_high_discount" : "high_discount",
      effectiveOriginal: null,
      effectivePromo: promo,
    };
  }

  // HIGH: caso normal, seguro para exibir DE/POR
  return {
    quality: "HIGH",
    showComparison: true,
    reason: "ok",
    effectiveOriginal: original,
    effectivePromo: promo,
  };
}

/**
 * Aplica a política de qualidade e retorna o `original_price` efetivo
 * para o renderer. Retorna `null` quando a comparação deve ser suprimida.
 *
 * Só aplica a filtragem para plataforma Shopee — demais plataformas
 * seguem o fluxo atual sem alteração.
 */
export function resolveDisplayOriginalPrice(product: PriceQualityInput): number | null {
  if ((product.platform ?? "").toLowerCase() !== "shopee") {
    return toNum(product.original_price);
  }
  const r = classifyShopeePriceQuality(product);
  return r.showComparison ? r.effectiveOriginal : null;
}
