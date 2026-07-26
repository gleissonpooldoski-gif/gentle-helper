/**
 * Background enrichment for Shopee products (image + prices).
 *
 * Lote 12F: substituído `fetchShopeePdp` (PDP público bloqueado por
 * `error 90309999`) pelo cliente oficial `fetchProductOfferByItem` (Shopee
 * Affiliate Open API). A política de gravação de `original_price` fica
 * concentrada em `derivePriceUpdate`, que agora consome
 * `deriveOriginalFromOffer` (Fonte 1: campo real da API; Fonte 2: derivado
 * de `priceDiscountRate`). Nunca inventa desconto.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scrapeShopeeImage, isRealProductImage } from "./image-resolver";
import {
  fetchProductOfferByItem,
  parseShopeeIds,
  deriveOriginalFromOffer,
  type ShopeeProductOffer,
} from "@/modules/shopee-affiliate/client.server";

type PriceUpdate = {
  promo_price?: number;
  original_price: number | null;
  is_discount: boolean;
  discount_percentage: number | null;
};

type OfferInput = Pick<ShopeeProductOffer, "price" | "originalPrice" | "discountRate">;

const EMPTY_OFFER: OfferInput = { price: null, originalPrice: null, discountRate: null };

/**
 * Resolve `{shopId, itemId}` a partir do raw_link (preferencial) ou do
 * `item_id` armazenado, que ocasionalmente vem como "shopId.itemId".
 */
function resolveIds(
  rawLink: string | null | undefined,
  storedItemId: string | null | undefined,
): { shopId: string | null; itemId: string } | null {
  const fromLink = parseShopeeIds(rawLink ?? null);
  if (fromLink) return fromLink;
  if (storedItemId) {
    const parts = String(storedItemId).split(".");
    if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
      return { shopId: parts[0], itemId: parts[1] };
    }
    if (/^\d+$/.test(String(storedItemId))) {
      return { shopId: null, itemId: String(storedItemId) };
    }
  }
  return null;
}

/**
 * Consulta oficial Shopee Affiliate a partir de raw_link + item_id.
 * Nunca lança — devolve `EMPTY_OFFER` em qualquer falha.
 */
async function fetchOffer(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  rawLink: string | null | undefined,
  storedItemId: string | null | undefined,
): Promise<OfferInput> {
  const ids = resolveIds(rawLink, storedItemId);
  if (!ids) return EMPTY_OFFER;
  const res = await fetchProductOfferByItem(supabase, userId, {
    itemId: ids.itemId,
    shopId: ids.shopId,
  }).catch(() => null);
  if (!res || !res.ok) return EMPTY_OFFER;
  return {
    price: res.offer.price,
    originalPrice: res.offer.originalPrice,
    discountRate: res.offer.discountRate,
  };
}

/**
 * Deriva os campos de preço a partir da oferta oficial. Aplica a política
 * do Lote 12F (FASE 1) e nunca grava `original_price` sem base real.
 */
function derivePriceUpdate(
  offer: OfferInput,
  existingPromo: number | null,
): {
  update: PriceUpdate | null;
  reason: "ok_discount" | "no_discount" | "no_promo";
  source: "api_real_field" | "derived_from_discount_rate" | null;
} {
  const promo = offer.price ?? existingPromo;
  if (promo == null || !Number.isFinite(promo) || promo <= 0) {
    return { update: null, reason: "no_promo", source: null };
  }
  const { originalPrice, source } = deriveOriginalFromOffer({
    price: promo,
    originalPrice: offer.originalPrice,
    discountRate: offer.discountRate,
  });
  const hasDiscount = originalPrice != null && originalPrice > promo;
  const pct = hasDiscount
    ? Math.round(((originalPrice - promo) / originalPrice) * 100)
    : null;
  const update: PriceUpdate = {
    original_price: hasDiscount ? originalPrice : null,
    is_discount: hasDiscount,
    discount_percentage: pct,
  };
  if (offer.price != null) update.promo_price = offer.price;
  return {
    update,
    reason: hasDiscount ? "ok_discount" : "no_discount",
    source: hasDiscount ? source : null,
  };
}


export const listPendingShopeeImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ channelId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("products")
      .select("id, item_id, raw_link, affiliate_link, image_url")
      .eq("user_id", context.userId)
      .eq("channel_id", data.channelId)
      .eq("platform", "shopee")
      .not("raw_link", "is", null);
    if (error) throw new Error(error.message);
    return (rows ?? [])
      .filter((r) => !!r.raw_link)
      .filter((r) => !isRealProductImage(r.image_url))
      .map((r) => ({
        id: r.id,
        itemId: r.item_id ?? null,
        productUrl: r.raw_link,
        offerUrl: r.affiliate_link,
      }));
  });


export const enrichShopeeImageOne = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        channelId: z.string().uuid(),
        id: z.string().min(1),
        itemId: z.string().nullish(),
        productUrl: z.string().min(1),
        offerUrl: z.string().nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const [image, offer, existing] = await Promise.all([
      scrapeShopeeImage(data.productUrl, data.offerUrl ?? null).catch(() => null),
      fetchOffer(context.supabase, context.userId, data.productUrl, data.itemId ?? null),
      context.supabase
        .from("products")
        .select("promo_price, title")
        .eq("id", data.id)
        .maybeSingle()
        .then((r) => r.data),
    ]);

    const priceResult = derivePriceUpdate(
      offer,
      existing?.promo_price != null ? Number(existing.promo_price) : null,
    );
    const priceUpdate = priceResult.update;

    const patch: Record<string, unknown> = {};
    if (image && isRealProductImage(image)) patch.image_url = image;
    if (priceUpdate) Object.assign(patch, priceUpdate);

    console.log("[SHOPEE_API_PRICE_SYNC]", {
      source: "enrich-one",
      product_id: data.id,
      title: existing?.title ?? null,
      promo_price: priceUpdate?.promo_price ?? existing?.promo_price ?? null,
      original_price: priceUpdate?.original_price ?? null,
      discount_exists: priceUpdate?.is_discount ?? false,
      reason: priceResult.reason,
      original_price_source: priceResult.source,
    });


    if (Object.keys(patch).length === 0) {
      return { id: data.id, itemId: data.itemId ?? null, found: false as const };
    }
    const { error } = await context.supabase
      .from("products")
      .update(patch as never)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .eq("channel_id", data.channelId);
    if (error) return { id: data.id, itemId: data.itemId ?? null, found: false as const };
    const found = !!patch.image_url;
    return {
      id: data.id,
      itemId: data.itemId ?? null,
      found,
      image: (patch.image_url as string | undefined) ?? null,
    };
  });

/**
 * Enriquecimento em LOTE: raspa várias imagens em paralelo no servidor e
 * grava tudo em uma única passada de UPDATEs. Reduz drasticamente o número
 * de RPCs (de N para N/8) e o overhead de rede/HMR no cliente.
 */
export const enrichShopeeImagesBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        channelId: z.string().uuid(),
        items: z
          .array(
            z.object({
              id: z.string().min(1),
              itemId: z.string().nullish(),
              productUrl: z.string().min(1),
              offerUrl: z.string().nullish(),
            }),
          )
          .min(1)
          .max(12),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Snapshot dos preços atuais para decidir se salvamos promo_price novo.
    const ids = data.items.map((i) => i.id);
    const { data: existingRows } = await context.supabase
      .from("products")
      .select("id, promo_price, title")
      .in("id", ids);
    const existingMap = new Map(
      (existingRows ?? []).map((r) => [
        r.id as string,
        {
          promo: r.promo_price != null ? Number(r.promo_price) : null,
          title: r.title as string | null,
        },
      ]),
    );

    // 1) Raspa imagem + consulta oficial Shopee em paralelo (I/O bound).
    const scraped = await Promise.all(
      data.items.map(async (item) => {
        const [image, offer] = await Promise.all([
          scrapeShopeeImage(item.productUrl, item.offerUrl ?? null).catch(() => null),
          fetchOffer(context.supabase, context.userId, item.productUrl, item.itemId ?? null),
        ]);
        return { item, image: image && isRealProductImage(image) ? image : null, offer };
      }),
    );

    // 2) Persiste em paralelo.
    const persisted = await Promise.all(
      scraped.map(async ({ item, image, offer }) => {
        const prev = existingMap.get(item.id);
        const priceResult = derivePriceUpdate(offer, prev?.promo ?? null);
        const priceUpdate = priceResult.update;

        const patch: Record<string, unknown> = {};
        if (image) patch.image_url = image;
        if (priceUpdate) Object.assign(patch, priceUpdate);

        console.log("[SHOPEE_API_PRICE_SYNC]", {
          source: "enrich-batch",
          product_id: item.id,
          title: prev?.title ?? null,
          promo_price: priceUpdate?.promo_price ?? prev?.promo ?? null,
          original_price: priceUpdate?.original_price ?? null,
          discount_exists: priceUpdate?.is_discount ?? false,
          reason: priceResult.reason,
          original_price_source: priceResult.source,
        });


        if (Object.keys(patch).length === 0) {
          return { id: item.id, itemId: item.itemId ?? null, found: false as const };
        }
        const { error } = await context.supabase
          .from("products")
          .update(patch as never)
          .eq("id", item.id)
          .eq("user_id", context.userId)
          .eq("channel_id", data.channelId);
        if (error) {
          return { id: item.id, itemId: item.itemId ?? null, found: false as const };
        }
        return {
          id: item.id,
          itemId: item.itemId ?? null,
          found: !!image,
          image: image ?? undefined,
        };
      }),
    );

    return { results: persisted };
  });

/**
 * Rotina retroativa: percorre produtos Shopee do canal cujo `original_price`
 * está NULL e tenta preencher via PDP. Retorna quantos foram corrigidos.
 * Executa em lotes para não estourar o timeout do worker.
 */
export const backfillShopeeOriginalPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        channelId: z.string().uuid(),
        limit: z.number().int().min(1).max(200).default(60),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("products")
      .select("id, promo_price, raw_link, title")
      .eq("user_id", context.userId)
      .eq("channel_id", data.channelId)
      .eq("platform", "shopee")
      .is("original_price", null)
      .not("raw_link", "is", null)
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as Array<{
      id: string; promo_price: number | null; raw_link: string | null; title: string | null;
    }>;
    if (list.length === 0) return { scanned: 0, updated: 0 };

    // Processa em janelas de 8 para não bombardear a Shopee.
    const WINDOW = 8;
    let updated = 0;
    for (let i = 0; i < list.length; i += WINDOW) {
      const chunk = list.slice(i, i + WINDOW);
      const results = await Promise.all(
        chunk.map(async (row) => {
          const pdp = await fetchShopeePdp(row.raw_link as string).catch(() => ({
            title: null, image: null, price: null, priceBefore: null, sold: null, soldLabel: null,
          }));
          const priceResult = derivePriceUpdate(
            pdp,
            row.promo_price != null ? Number(row.promo_price) : null,
          );
          const priceUpdate = priceResult.update;
          console.log("[PRODUCT_PRICE_CAPTURE]", {
            source: "backfill",
            product_id: row.id,
            title: row.title,
            promo_price: priceUpdate?.promo_price ?? row.promo_price,
            original_price: priceUpdate?.original_price ?? null,
            discount_exists: priceUpdate?.is_discount ?? false,
            reason: priceResult.reason,
          });
          if (!priceUpdate || !priceUpdate.is_discount) return false;
          const { error: uErr } = await context.supabase
            .from("products")
            .update(priceUpdate)
            .eq("id", row.id)
            .eq("user_id", context.userId)
            .eq("channel_id", data.channelId);
          return !uErr;

        }),
      );
      updated += results.filter(Boolean).length;
    }

    return { scanned: list.length, updated };
  });
