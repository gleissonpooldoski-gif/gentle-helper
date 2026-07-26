/**
 * Lote 15E — Recuperação e reconciliação da base Shopee.
 *
 * `repairShopeeProducts()` corrige DADOS antigos contaminados em `products`:
 *  - vendas truncadas (parser CSV legado quebrava "6 mil" → 6);
 *  - preço promocional trocado por variação errada (priceMin);
 *  - `original_price` ausente quando existe desconto real.
 *
 * Regras obrigatórias:
 *  1. Isolado por `user_id` — cada tenant usa a própria credencial em
 *     `shopee_affiliate_configs`. Sem config → aborta com
 *     `missing_affiliate_credentials`.
 *  2. Reutiliza o `price-guard` do Lote 15C. Preço só é atualizado quando
 *     `status === "accepted"`. Nunca sobrescreve em variant_mismatch /
 *     suspicious_drop / suspicious_jump.
 *  3. `sales` só cresce: `new_sales > old_sales` atualiza; caso contrário
 *     mantém o valor atual.
 *  4. `original_price` só é persistido quando `original_price > promo_price`
 *     (regra Lote 15C). Caso contrário grava NULL.
 *  5. Log estruturado `[SHOPEE_REPAIR]` por produto — sem tocar em segredos.
 *
 * Server-only. Nunca importar em módulo carregado pelo cliente.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  fetchProductOfferByItem,
  parseShopeeIds,
  deriveOriginalFromOffer,
} from "./client.server";
import { validateShopeePriceUpdate } from "./price-guard";
import { formatSalesLabel } from "@/modules/products/sales-label";

export type RepairStatus =
  | "updated"
  | "no_change"
  | "price_blocked"
  | "sales_only"
  | "price_only"
  | "missing_ids"
  | "not_found"
  | "api_error"
  | "missing_affiliate_credentials"
  | "product_not_found";

export type RepairRecord = {
  productId: string;
  itemId: string | null;
  title: string | null;
  oldSales: number | null;
  newSales: number | null;
  oldPrice: number | null;
  newPrice: number | null;
  oldOriginal: number | null;
  newOriginal: number | null;
  status: RepairStatus;
  reason: string;
};

type ProductRow = {
  id: string;
  title: string | null;
  item_id: string | null;
  raw_link: string | null;
  promo_price: number | string | null;
  original_price: number | string | null;
  sales: number | null;
  sales_label: string | null;
};

function toNum(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function resolveIds(rawLink: string | null, itemId: string | null) {
  const fromLink = parseShopeeIds(rawLink);
  if (fromLink) return fromLink;
  if (itemId) {
    const parts = String(itemId).split(".");
    if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
      return { shopId: parts[0], itemId: parts[1] };
    }
    if (/^\d+$/.test(String(itemId))) {
      return { shopId: null as string | null, itemId: String(itemId) };
    }
  }
  return null;
}

function logRepair(userId: string, r: RepairRecord) {
  console.log(
    "[SHOPEE_REPAIR]",
    JSON.stringify({
      userId,
      productId: r.productId,
      itemId: r.itemId,
      oldSales: r.oldSales,
      newSales: r.newSales,
      oldPrice: r.oldPrice,
      newPrice: r.newPrice,
      status: r.status,
      reason: r.reason,
    }),
  );
}

/** Verifica se o usuário tem credencial ativa em shopee_affiliate_configs. */
async function hasAffiliateCredentials(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("shopee_affiliate_configs")
    .select("user_id, has_api_key, status")
    .eq("user_id", userId)
    .maybeSingle();
  return !!(data && data.has_api_key && data.status === "active");
}

/** Repara UM produto Shopee. Nunca lança. */
async function repairOne(
  supabase: SupabaseClient<Database>,
  userId: string,
  product: ProductRow,
): Promise<RepairRecord> {
  const oldPrice = toNum(product.promo_price);
  const oldOriginal = toNum(product.original_price);
  const oldSales = product.sales ?? null;

  const base: RepairRecord = {
    productId: product.id,
    itemId: product.item_id,
    title: product.title,
    oldSales,
    newSales: oldSales,
    oldPrice,
    newPrice: oldPrice,
    oldOriginal,
    newOriginal: oldOriginal,
    status: "no_change",
    reason: "unchanged",
  };

  const ids = resolveIds(product.raw_link, product.item_id);
  if (!ids) {
    const rec = { ...base, status: "missing_ids" as const, reason: "missing_ids" };
    logRepair(userId, rec);
    return rec;
  }

  const res = await fetchProductOfferByItem(supabase, userId, {
    itemId: ids.itemId,
    shopId: ids.shopId,
  }).catch(() => null);

  if (!res || !res.ok) {
    const reason = !res ? "network_error" : res.reason;
    const status: RepairStatus = reason === "not_found" ? "not_found" : "api_error";
    const rec = { ...base, status, reason };
    logRepair(userId, rec);
    return rec;
  }

  const offer = res.offer;

  // === PREÇO ===
  const guard = validateShopeePriceUpdate(
    { promoPrice: oldPrice, itemId: ids.itemId, shopId: ids.shopId },
    {
      price: offer.price,
      priceMin: offer.priceMin,
      priceMax: offer.priceMax,
      itemId: offer.itemId,
      shopId: offer.shopId,
    },
  );

  let newPrice = oldPrice;
  let newOriginal = oldOriginal;
  let priceUpdated = false;
  let priceBlocked = false;
  let priceReason = guard.reason;

  if (guard.status === "accepted" && offer.price != null && offer.price > 0) {
    newPrice = offer.price;
    const { originalPrice } = deriveOriginalFromOffer({
      price: newPrice,
      originalPrice: offer.originalPrice,
      discountRate: offer.discountRate,
    });
    newOriginal =
      originalPrice != null && originalPrice > newPrice ? originalPrice : null;
    priceUpdated =
      newPrice !== oldPrice || (newOriginal ?? null) !== (oldOriginal ?? null);
  } else if (guard.status === "blocked") {
    priceBlocked = true;
  }

  // === VENDAS === (só cresce)
  let newSales = oldSales;
  const apiSales = offer.sales ?? null;
  let salesUpdated = false;
  let salesReason = "sales_kept";
  if (apiSales != null && apiSales > (oldSales ?? 0)) {
    newSales = apiSales;
    salesUpdated = true;
    salesReason = "sales_grew";
  } else if (apiSales != null && apiSales <= (oldSales ?? 0)) {
    salesReason = "api_sales_not_greater";
  } else {
    salesReason = "api_sales_missing";
  }

  // === APLICAR ===
  const patch: Record<string, unknown> = {};
  if (priceUpdated) {
    patch.promo_price = newPrice;
    patch.original_price = newOriginal;
    patch.is_discount = newOriginal != null && newOriginal > (newPrice ?? 0);
    patch.discount_percentage =
      newOriginal != null && newPrice != null && newOriginal > newPrice
        ? Math.round(((newOriginal - newPrice) / newOriginal) * 100)
        : null;
  }
  if (salesUpdated) {
    patch.sales = newSales;
    patch.sales_label = formatSalesLabel(newSales);
  }

  if (Object.keys(patch).length > 0) {
    patch.updated_at = new Date().toISOString();
    await supabase
      .from("products")
      .update(patch as never)
      .eq("id", product.id)
      .eq("user_id", userId);
  }

  let status: RepairStatus;
  let reason: string;
  if (priceUpdated && salesUpdated) {
    status = "updated";
    reason = `${priceReason}+${salesReason}`;
  } else if (priceUpdated) {
    status = "price_only";
    reason = `${priceReason}+${salesReason}`;
  } else if (salesUpdated) {
    status = priceBlocked ? "sales_only" : "sales_only";
    reason = priceBlocked ? `price_blocked:${priceReason}+${salesReason}` : salesReason;
  } else if (priceBlocked) {
    status = "price_blocked";
    reason = priceReason;
  } else {
    status = "no_change";
    reason = `${priceReason}+${salesReason}`;
  }

  const rec: RepairRecord = {
    ...base,
    newPrice,
    newOriginal,
    newSales,
    status,
    reason,
  };
  logRepair(userId, rec);
  return rec;
}

export type RepairMode = "pilot" | "full";

export type RepairSummary = {
  mode: RepairMode;
  userId: string;
  total: number;
  byStatus: Record<string, number>;
  records: RepairRecord[];
};

/**
 * Executa reparo em produtos Shopee do usuário.
 * - mode="pilot": 50 aleatórios + 50 de maior risco (kits + sales<=998).
 * - mode="full": todos os produtos Shopee do usuário.
 * Concorrência 3. Nunca lança.
 */
export async function repairShopeeProducts(
  supabase: SupabaseClient<Database>,
  userId: string,
  opts: { mode: RepairMode; concurrency?: number } = { mode: "pilot" },
): Promise<RepairSummary> {
  const started = Date.now();
  const mode = opts.mode;

  if (!(await hasAffiliateCredentials(supabase, userId))) {
    console.log(
      "[SHOPEE_REPAIR:aborted]",
      JSON.stringify({ userId, mode, reason: "missing_affiliate_credentials" }),
    );
    return {
      mode,
      userId,
      total: 0,
      byStatus: { missing_affiliate_credentials: 1 },
      records: [],
    };
  }

  // Seleção de produtos
  let products: ProductRow[] = [];

  if (mode === "pilot") {
    const cols =
      "id, title, item_id, raw_link, promo_price, original_price, sales, sales_label";

    // Alto risco: título contém kit/combo/pacote/unidades/peças + sales<=998
    const { data: risky } = await supabase
      .from("products")
      .select(cols)
      .eq("user_id", userId)
      .eq("platform", "shopee")
      .lte("sales", 998)
      .or(
        "title.ilike.%kit%,title.ilike.%combo%,title.ilike.%pacote%,title.ilike.%unidades%,title.ilike.%unidade%,title.ilike.%peças%,title.ilike.%pecas%",
      )
      .limit(200);
    const riskyPool = (risky as ProductRow[] | null) ?? [];
    // Embaralha e pega 50
    const shuffled = [...riskyPool].sort(() => Math.random() - 0.5).slice(0, 50);
    const riskyIds = new Set(shuffled.map((p) => p.id));

    // Aleatórios: resto da base, exclui já selecionados
    const { data: rest } = await supabase
      .from("products")
      .select(cols)
      .eq("user_id", userId)
      .eq("platform", "shopee")
      .limit(500);
    const restPool = ((rest as ProductRow[] | null) ?? []).filter(
      (p) => !riskyIds.has(p.id),
    );
    const random = [...restPool].sort(() => Math.random() - 0.5).slice(0, 50);

    products = [...shuffled, ...random];
  } else {
    const { data: all } = await supabase
      .from("products")
      .select(
        "id, title, item_id, raw_link, promo_price, original_price, sales, sales_label",
      )
      .eq("user_id", userId)
      .eq("platform", "shopee");
    products = (all as ProductRow[] | null) ?? [];
  }

  // Executa com concorrência limitada
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 3, 5));
  const records: RepairRecord[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < products.length) {
      const idx = cursor++;
      const p = products[idx];
      try {
        records.push(await repairOne(supabase, userId, p));
      } catch (e) {
        const rec: RepairRecord = {
          productId: p.id,
          itemId: p.item_id,
          title: p.title,
          oldSales: p.sales,
          newSales: p.sales,
          oldPrice: toNum(p.promo_price),
          newPrice: toNum(p.promo_price),
          oldOriginal: toNum(p.original_price),
          newOriginal: toNum(p.original_price),
          status: "api_error",
          reason: e instanceof Error ? e.message : String(e),
        };
        logRepair(userId, rec);
        records.push(rec);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, products.length) }, () => worker()),
  );

  const byStatus = records.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    "[SHOPEE_REPAIR:summary]",
    JSON.stringify({
      userId,
      mode,
      total: records.length,
      byStatus,
      duration: Date.now() - started,
    }),
  );
  return { mode, userId, total: records.length, byStatus, records };
}
