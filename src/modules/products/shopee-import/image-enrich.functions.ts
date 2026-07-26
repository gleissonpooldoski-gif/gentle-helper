/**
 * Background enrichment for Shopee products (image + prices).
 * Client lists pending products, then calls the batch/one endpoints so we
 * can show live progress. In addition to the image, we now call the Shopee
 * PDP API to also enrich `promo_price`, `original_price`, `is_discount` and
 * `discount_percentage` — the CSV import only carries the current price.
 *
 * Regra de preço:
 *   original_price > promo_price → salvar original_price
 *   caso contrário               → original_price = null
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scrapeShopeeImage, isRealProductImage } from "./image-resolver";
import { fetchShopeePdp } from "@/modules/monitor/capture.server";

type PriceUpdate = {
  promo_price?: number;
  original_price: number | null;
  is_discount: boolean;
  discount_percentage: number | null;
};

/**
 * Deriva os campos de preço a partir do PDP, aplicando a regra:
 *   original_price > promo_price → mantém original_price
 *   caso contrário               → original_price = null
 */
function derivePriceUpdate(
  pdp: { price: number | null; priceBefore: number | null },
  existingPromo: number | null,
): { update: PriceUpdate; reason: "ok_discount" | "no_discount" } | { update: null; reason: "no_promo" } {
  const promo = pdp.price ?? existingPromo;
  if (promo == null || !Number.isFinite(promo) || promo <= 0) {
    return { update: null, reason: "no_promo" };
  }
  const hasDiscount =
    pdp.priceBefore != null && Number.isFinite(pdp.priceBefore) && pdp.priceBefore > promo;
  const original = hasDiscount ? (pdp.priceBefore as number) : null;
  const pct = hasDiscount ? Math.round(((original! - promo) / original!) * 100) : null;
  const update: PriceUpdate = {
    original_price: original,
    is_discount: hasDiscount,
    discount_percentage: pct,
  };
  if (pdp.price != null) update.promo_price = pdp.price;
  return { update, reason: hasDiscount ? "ok_discount" : "no_discount" };
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
    const [image, pdp, existing] = await Promise.all([
      scrapeShopeeImage(data.productUrl, data.offerUrl ?? null).catch(() => null),
      fetchShopeePdp(data.productUrl).catch(() => ({
        title: null, image: null, price: null, priceBefore: null, sold: null, soldLabel: null,
      })),
      context.supabase
        .from("products")
        .select("promo_price, title")
        .eq("id", data.id)
        .maybeSingle()
        .then((r) => r.data),
    ]);

    const priceUpdate = derivePriceUpdate(
      pdp,
      existing?.promo_price != null ? Number(existing.promo_price) : null,
    );

    const patch: Record<string, unknown> = {};
    if (image && isRealProductImage(image)) patch.image_url = image;
    if (priceUpdate) Object.assign(patch, priceUpdate);

    if (priceUpdate) {
      console.log("[PRODUCT_PRICE_CAPTURE]", {
        source: "enrich-one",
        title: existing?.title ?? null,
        promo_price: priceUpdate.promo_price ?? existing?.promo_price ?? null,
        original_price: priceUpdate.original_price,
        discount_exists: priceUpdate.is_discount,
      });
    }

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

    // 1) Raspa imagem + PDP em paralelo (I/O bound).
    const scraped = await Promise.all(
      data.items.map(async (item) => {
        const [image, pdp] = await Promise.all([
          scrapeShopeeImage(item.productUrl, item.offerUrl ?? null).catch(() => null),
          fetchShopeePdp(item.productUrl).catch(() => ({
            title: null, image: null, price: null, priceBefore: null, sold: null, soldLabel: null,
          })),
        ]);
        return { item, image: image && isRealProductImage(image) ? image : null, pdp };
      }),
    );

    // 2) Persiste em paralelo.
    const persisted = await Promise.all(
      scraped.map(async ({ item, image, pdp }) => {
        const prev = existingMap.get(item.id);
        const priceUpdate = derivePriceUpdate(pdp, prev?.promo ?? null);

        const patch: Record<string, unknown> = {};
        if (image) patch.image_url = image;
        if (priceUpdate) Object.assign(patch, priceUpdate);

        if (priceUpdate) {
          console.log("[PRODUCT_PRICE_CAPTURE]", {
            source: "enrich-batch",
            title: prev?.title ?? null,
            promo_price: priceUpdate.promo_price ?? prev?.promo ?? null,
            original_price: priceUpdate.original_price,
            discount_exists: priceUpdate.is_discount,
          });
        }

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
          const priceUpdate = derivePriceUpdate(
            pdp,
            row.promo_price != null ? Number(row.promo_price) : null,
          );
          if (!priceUpdate || !priceUpdate.is_discount) return false;
          console.log("[PRODUCT_PRICE_CAPTURE]", {
            source: "backfill",
            title: row.title,
            promo_price: priceUpdate.promo_price ?? row.promo_price,
            original_price: priceUpdate.original_price,
            discount_exists: priceUpdate.is_discount,
          });
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
