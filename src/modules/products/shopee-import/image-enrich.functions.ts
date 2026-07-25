/**
 * Background image enrichment for Shopee products.
 * Client lists pending products, then calls `enrichShopeeImageOne` per product
 * with bounded concurrency so we can show live progress ("X / Y").
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scrapeShopeeImage, isRealProductImage } from "./image-resolver";

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
    const image = await scrapeShopeeImage(data.productUrl, data.offerUrl ?? null);
    if (!image || !isRealProductImage(image)) {
      return { id: data.id, itemId: data.itemId ?? null, found: false as const };
    }
    const { error } = await context.supabase
      .from("products")
      .update({ image_url: image })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .eq("channel_id", data.channelId);
    if (error) return { id: data.id, itemId: data.itemId ?? null, found: false as const };
    return { id: data.id, itemId: data.itemId ?? null, found: true as const, image };
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
    // 1) Raspa todas as imagens do batch em paralelo (I/O bound).
    const scraped = await Promise.all(
      data.items.map(async (item) => {
        try {
          const image = await scrapeShopeeImage(item.productUrl, item.offerUrl ?? null);
          return { item, image: image && isRealProductImage(image) ? image : null };
        } catch {
          return { item, image: null };
        }
      }),
    );

    // 2) Persiste em paralelo (uma UPDATE por linha, mas todas juntas).
    const persisted = await Promise.all(
      scraped.map(async ({ item, image }) => {
        if (!image) {
          return { id: item.id, itemId: item.itemId ?? null, found: false as const };
        }
        const { error } = await context.supabase
          .from("products")
          .update({ image_url: image })
          .eq("id", item.id)
          .eq("user_id", context.userId)
          .eq("channel_id", data.channelId);
        if (error) {
          return { id: item.id, itemId: item.itemId ?? null, found: false as const };
        }
        return { id: item.id, itemId: item.itemId ?? null, found: true as const, image };
      }),
    );

    return { results: persisted };
  });

