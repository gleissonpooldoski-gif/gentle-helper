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
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("products")
      .select("id, item_id, raw_link, affiliate_link, image_url")
      .eq("user_id", context.userId)
      .eq("platform", "shopee")
      .not("raw_link", "is", null);
    if (error) throw new Error(error.message);
    return (data ?? [])
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
        id: z.string().min(1),
        productUrl: z.string().min(1),
        offerUrl: z.string().nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const image = await scrapeShopeeImage(data.productUrl, data.offerUrl ?? null);
    if (!image || !isRealProductImage(image)) {
      return { id: data.id, found: false as const };
    }
    const { error } = await context.supabase
      .from("products")
      .update({ image_url: image })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) return { id: data.id, found: false as const };
    return { id: data.id, found: true as const, image };
  });
