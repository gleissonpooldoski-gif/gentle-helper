/**
 * Auto-sincronização de preço Shopee pós-importação (Lote 12G).
 *
 * `syncShopeePriceOne` consulta a Shopee Affiliate Open API para um único
 * produto e aplica a política oficial de preço (Fonte 1 / Fonte 2, ver
 * Lote 12F). NUNCA inventa desconto. Retry com backoff 1s → 3s → 8s
 * apenas em falhas transientes (network / 5xx / rate limit). Erros
 * permanentes (not_found, invalid_token, missing_ids) não retentam.
 *
 * Log estruturado single-line: `[SHOPEE_PRICE_AUTO_SYNC] {...}`.
 * Nunca loga secret / signature / headers.
 *
 * Server-only (importa client.server via chamador). Não expor ao bundle
 * cliente — filename `.server.ts` bloqueia isso pelo import-guard.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  fetchProductOfferByItem,
  parseShopeeIds,
  deriveOriginalFromOffer,
} from "./client.server";
import { validateShopeePriceUpdate } from "./price-guard";
const FRESH_WINDOW_MS = 12 * 60 * 60 * 1000; // 12h

export type AutoSyncStatus =
  | "success"
  | "no_discount"
  | "missing_ids"
  | "already_fresh"
  | "not_found"
  | "api_error"
  | "product_not_found";

export type AutoSyncResult = {
  productId: string;
  status: AutoSyncStatus;
  source: "api_real_field" | "derived_from_discount_rate" | null;
  originalPrice: number | null;
  promoPrice: number | null;
  duration: number;
};

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

function isTransient(reason: string): boolean {
  return reason === "network_error" || reason === "api_error";
}

async function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

const BACKOFF_MS = [1000, 3000, 8000];

/**
 * Sincroniza preço de UM produto Shopee.
 * - Skip se `original_price` já preenchido e `updated_at` recente.
 * - Retry backoff só em erros transientes.
 * - Nunca lança: sempre retorna um `AutoSyncResult` com status classificado.
 */
export async function syncShopeePriceOne(
  supabase: SupabaseClient<Database>,
  userId: string,
  productId: string,
): Promise<AutoSyncResult> {
  const started = Date.now();
  const log = (r: AutoSyncResult) => {
    console.log(
      "[SHOPEE_PRICE_AUTO_SYNC]",
      JSON.stringify({
        productId: r.productId,
        userId,
        status: r.status,
        source: r.source,
        originalPrice: r.originalPrice,
        promoPrice: r.promoPrice,
        duration: r.duration,
      }),
    );
    return r;
  };

  const { data: product } = await supabase
    .from("products")
    .select("id, promo_price, original_price, raw_link, item_id, updated_at, platform, user_id")
    .eq("id", productId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!product || product.platform !== "shopee") {
    return log({
      productId,
      status: "product_not_found",
      source: null,
      originalPrice: null,
      promoPrice: null,
      duration: Date.now() - started,
    });
  }

  // FASE 4: dedup — pula se já sincronizado recentemente.
  if (product.original_price != null && product.updated_at) {
    const ageMs = Date.now() - new Date(product.updated_at as string).getTime();
    if (ageMs < FRESH_WINDOW_MS) {
      return log({
        productId,
        status: "already_fresh",
        source: null,
        originalPrice: Number(product.original_price),
        promoPrice: product.promo_price != null ? Number(product.promo_price) : null,
        duration: Date.now() - started,
      });
    }
  }

  const ids = resolveIds(
    (product.raw_link as string | null) ?? null,
    (product.item_id as string | null) ?? null,
  );
  if (!ids) {
    return log({
      productId,
      status: "missing_ids",
      source: null,
      originalPrice: null,
      promoPrice: product.promo_price != null ? Number(product.promo_price) : null,
      duration: Date.now() - started,
    });
  }

  // Retry com backoff apenas em transient.
  let lastReason = "api_error";
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    const res = await fetchProductOfferByItem(supabase, userId, {
      itemId: ids.itemId,
      shopId: ids.shopId,
    }).catch(() => null);

    if (res && res.ok) {
      const existingPromo =
        product.promo_price != null ? Number(product.promo_price) : null;
      const promo = res.offer.price ?? existingPromo ?? 0;
      const { originalPrice, source } = deriveOriginalFromOffer({
        price: promo > 0 ? promo : null,
        originalPrice: res.offer.originalPrice,
        discountRate: res.offer.discountRate,
      });
      const hasDiscount = originalPrice != null && originalPrice > promo;

      const patch: Record<string, unknown> = {};
      if (res.offer.price != null) patch.promo_price = res.offer.price;
      patch.original_price = hasDiscount ? originalPrice : null;
      patch.is_discount = hasDiscount;
      patch.discount_percentage = hasDiscount
        ? Math.round(((originalPrice! - promo) / originalPrice!) * 100)
        : null;
      patch.updated_at = new Date().toISOString();

      await supabase
        .from("products")
        .update(patch as never)
        .eq("id", productId)
        .eq("user_id", userId);

      return log({
        productId,
        status: hasDiscount ? "success" : "no_discount",
        source: hasDiscount ? source : null,
        originalPrice: hasDiscount ? originalPrice : null,
        promoPrice: promo > 0 ? promo : null,
        duration: Date.now() - started,
      });
    }

    if (!res) {
      lastReason = "network_error";
    } else {
      lastReason = res.reason;
      // Permanentes: sai imediatamente.
      if (!isTransient(res.reason)) {
        const status: AutoSyncStatus =
          res.reason === "not_found" ? "not_found" : "api_error";
        return log({
          productId,
          status,
          source: null,
          originalPrice: null,
          promoPrice: product.promo_price != null ? Number(product.promo_price) : null,
          duration: Date.now() - started,
        });
      }
    }

    if (attempt < BACKOFF_MS.length) {
      await sleep(BACKOFF_MS[attempt]);
    }
  }

  return log({
    productId,
    status: "api_error",
    source: null,
    originalPrice: null,
    promoPrice: product.promo_price != null ? Number(product.promo_price) : null,
    duration: Date.now() - started,
  });
}

/**
 * Executa `syncShopeePriceOne` para múltiplos produtos com concorrência
 * limitada. Nunca lança — coleta resultados individuais.
 */
export async function syncShopeePricesBatch(
  supabase: SupabaseClient<Database>,
  userId: string,
  productIds: string[],
  concurrency = 3,
): Promise<AutoSyncResult[]> {
  const results: AutoSyncResult[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < productIds.length) {
      const idx = cursor++;
      const id = productIds[idx];
      try {
        results.push(await syncShopeePriceOne(supabase, userId, id));
      } catch (e) {
        console.log(
          "[SHOPEE_PRICE_AUTO_SYNC]",
          JSON.stringify({
            productId: id,
            userId,
            status: "api_error",
            source: null,
            originalPrice: null,
            promoPrice: null,
            duration: 0,
            error: e instanceof Error ? e.message : String(e),
          }),
        );
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, productIds.length) }, () => worker()),
  );
  return results;
}
