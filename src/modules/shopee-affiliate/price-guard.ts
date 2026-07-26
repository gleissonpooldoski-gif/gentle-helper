/**
 * Lote 15C — Proteção de preço Shopee.
 *
 * Valida uma atualização de preço vinda da Shopee Affiliate Open API
 * contra o preço já persistido no banco. Bloqueia trocas suspeitas que
 * geralmente indicam preço de outra variação (a API v2 retorna o preço
 * da variação mínima quando existe faixa de SKUs).
 *
 * Pure, síncrono, sem I/O — seguro para import no cliente e no servidor.
 * NÃO consulta banco, NÃO chama API. Chamador aplica o resultado.
 */

export type PriceGuardStatus = "accepted" | "blocked";

export type PriceGuardReason =
  | "first_fill"
  | "same_price"
  | "small_change"
  | "moderate_change_within_range"
  | "no_new_price"
  | "shop_mismatch"
  | "item_mismatch"
  | "possible_variant_mismatch_lower"
  | "possible_variant_mismatch_higher"
  | "suspicious_drop"
  | "suspicious_jump";

export type PriceGuardResult = {
  status: PriceGuardStatus;
  reason: PriceGuardReason;
  oldPrice: number | null;
  newPrice: number | null;
  /** Percentual assinado (novo - antigo)/antigo, arredondado 1 casa. */
  diffPct: number | null;
};

export type PriceGuardCurrent = {
  promoPrice: number | null;
  itemId: string | null;
  shopId: string | null;
};

export type PriceGuardApi = {
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  itemId: string | null;
  shopId: string | null;
};

/** Diferença tolerada sem gerar suspeita. */
const SMALL_CHANGE_PCT = 0.05; // 5%
/** Além disso, precisa se enquadrar em regras adicionais. */
const SUSPICIOUS_DROP_PCT = -0.4; // -40%
const SUSPICIOUS_JUMP_PCT = 0.6; // +60%
/** Faixa de variação relevante (max ≥ min * 1,15). */
const VARIANT_RANGE_RATIO = 1.15;
/** Margem para considerar o preço "dentro" da faixa reportada. */
const RANGE_MARGIN = 0.02; // 2%

function pct(newP: number, oldP: number): number {
  return Math.round(((newP - oldP) / oldP) * 1000) / 10;
}

export function validateShopeePriceUpdate(
  current: PriceGuardCurrent,
  api: PriceGuardApi,
): PriceGuardResult {
  const newPrice =
    api.price != null && Number.isFinite(api.price) && api.price > 0
      ? api.price
      : null;
  const oldPrice =
    current.promoPrice != null &&
    Number.isFinite(current.promoPrice) &&
    current.promoPrice > 0
      ? current.promoPrice
      : null;

  if (newPrice == null) {
    return {
      status: "blocked",
      reason: "no_new_price",
      oldPrice,
      newPrice: null,
      diffPct: null,
    };
  }

  // Identidade — se a API voltou outro anúncio, sempre bloquear.
  if (current.shopId && api.shopId && current.shopId !== api.shopId) {
    return {
      status: "blocked",
      reason: "shop_mismatch",
      oldPrice,
      newPrice,
      diffPct: oldPrice ? pct(newPrice, oldPrice) : null,
    };
  }
  if (current.itemId && api.itemId && current.itemId !== api.itemId) {
    return {
      status: "blocked",
      reason: "item_mismatch",
      oldPrice,
      newPrice,
      diffPct: oldPrice ? pct(newPrice, oldPrice) : null,
    };
  }

  // Primeiro preenchimento — nada a comparar.
  if (oldPrice == null) {
    return {
      status: "accepted",
      reason: "first_fill",
      oldPrice: null,
      newPrice,
      diffPct: null,
    };
  }

  const diff = (newPrice - oldPrice) / oldPrice;
  const absDiff = Math.abs(diff);
  const diffPct = pct(newPrice, oldPrice);

  // Mudança irrisória — aceitar sem análise.
  if (absDiff <= SMALL_CHANGE_PCT) {
    return {
      status: "accepted",
      reason: absDiff === 0 ? "same_price" : "small_change",
      oldPrice,
      newPrice,
      diffPct,
    };
  }

  // Faixa de variação detectada — verificar se o preço atual do banco
  // faz parte dessa faixa. Se o banco está acima do teto ou abaixo do
  // piso, a API está devolvendo variação diferente da usada no CSV.
  const hasRange =
    api.priceMin != null &&
    api.priceMax != null &&
    api.priceMin > 0 &&
    api.priceMax >= api.priceMin * VARIANT_RANGE_RATIO;
  if (hasRange) {
    const ceiling = api.priceMax! * (1 + RANGE_MARGIN);
    const floor = api.priceMin! * (1 - RANGE_MARGIN);
    if (oldPrice > ceiling) {
      return {
        status: "blocked",
        reason: "possible_variant_mismatch_lower",
        oldPrice,
        newPrice,
        diffPct,
      };
    }
    if (oldPrice < floor) {
      return {
        status: "blocked",
        reason: "possible_variant_mismatch_higher",
        oldPrice,
        newPrice,
        diffPct,
      };
    }
    // Banco dentro da faixa — mudança moderada é aceita, mesmo > 5%.
    return {
      status: "accepted",
      reason: "moderate_change_within_range",
      oldPrice,
      newPrice,
      diffPct,
    };
  }

  // Sem faixa de variação declarada — variações grandes viram suspeita.
  if (diff <= SUSPICIOUS_DROP_PCT) {
    return {
      status: "blocked",
      reason: "suspicious_drop",
      oldPrice,
      newPrice,
      diffPct,
    };
  }
  if (diff >= SUSPICIOUS_JUMP_PCT) {
    return {
      status: "blocked",
      reason: "suspicious_jump",
      oldPrice,
      newPrice,
      diffPct,
    };
  }

  return {
    status: "accepted",
    reason: "small_change",
    oldPrice,
    newPrice,
    diffPct,
  };
}
