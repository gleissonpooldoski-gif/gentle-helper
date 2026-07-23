/**
 * Server-function controllers for Mercado Livre product ingestion + search.
 * Loads the user's OAuth access_token (auto-refresh) before every API call.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildAffiliateUrl,
  getHighlights,
  getItemById,
  parseMLBId,
  resolveShortLink,
  searchItems,
  type MLItem,
} from "./api-client";
import { upsertProducts, type MLProductUpsert } from "./repository";
import { findConnection } from "@/modules/affiliate/mercado-livre/repository";

async function loadAffiliateTag(
  supabase: Parameters<typeof findConnection>[0],
  userId: string,
): Promise<string | null> {
  try {
    const row = await findConnection(supabase, userId);
    return row?.affiliate_tag ?? null;
  } catch {
    return null;
  }
}

async function loadToken(userId: string): Promise<string> {
  const { getValidAccessToken } = await import(
    "@/modules/affiliate/mercado-livre/oauth.server"
  );
  const token = await getValidAccessToken(userId);
  console.log("[ML][ctrl] getValidAccessToken", { userId, tokenValid: token ? "SIM" : "NAO" });
  return token;
}

async function tryLoadToken(userId: string): Promise<string | null> {
  try {
    return await loadToken(userId);
  } catch (e) {
    console.log("[ML][ctrl] getValidAccessToken", {
      userId,
      tokenValid: "NAO",
      reason: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

function toUpsert(userId: string, item: MLItem, affiliateTag: string | null): MLProductUpsert {
  return {
    user_id: userId,
    platform: "mercadolivre",
    item_id: item.id,
    title: item.title,
    store_name: item.sellerId ? `Vendedor #${item.sellerId}` : null,
    original_price: item.originalPrice,
    promo_price: item.price,
    sales: item.sold,
    commission_rate: null,
    commission_value: null,
    raw_link: item.permalink,
    affiliate_link: buildAffiliateUrl(item.permalink, affiliateTag),
    image_url: item.thumbnail ?? item.pictures[0] ?? null,
  };
}

/** Add one product by pasting any ML URL / short link / raw MLB id. */
export const addMLProductByLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ link: z.string().min(3) }).parse(input))
  .handler(async ({ data, context }) => {
    const raw = data.link.trim();
    let mlbId = parseMLBId(raw);
    if (!mlbId && /^https?:\/\//i.test(raw)) {
      const finalUrl = await resolveShortLink(raw);
      if (finalUrl) mlbId = parseMLBId(finalUrl);
    }
    if (!mlbId) throw new Error("Não foi possível identificar o código MLB neste link.");

    const token = await loadToken(context.userId);
    const item = await getItemById(mlbId, token);
    if (!item) throw new Error(`Produto ${mlbId} não encontrado na API do Mercado Livre.`);

    const tag = await loadAffiliateTag(context.supabase, context.userId);
    const outcome = await upsertProducts(context.supabase, context.userId, [
      toUpsert(context.userId, item, tag),
    ]);

    return {
      product: {
        id: item.id,
        title: item.title,
        price: item.price,
        originalPrice: item.originalPrice,
        discount: item.discount,
        imageUrl: item.thumbnail ?? item.pictures[0] ?? null,
        permalink: item.permalink,
        affiliateUrl: buildAffiliateUrl(item.permalink, tag),
        affiliateReady: !!tag,
      },
      inserted: outcome.inserted,
      updated: outcome.updated,
    };
  });

/** Search the Mercado Livre catalog (paginated). */
export const searchMLProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        query: z.string().optional(),
        categoryId: z.string().optional(),
        mode: z.enum(["search", "deals", "best_sellers"]).default("search"),
        offset: z.number().int().min(0).max(1000).default(0),
        limit: z.number().int().min(1).max(50).default(24),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const token = await tryLoadToken(context.userId);
    console.log("[ML][ctrl] search", {
      mode: data.mode, query: data.query, categoryId: data.categoryId,
      offset: data.offset, limit: data.limit, tokenValid: token ? "SIM" : "NAO",
    });
    if (data.mode === "deals") return getHighlights(data.offset, data.limit, token ?? undefined);
    return searchItems(
      {
        query: data.query,
        categoryId: data.categoryId,
        offset: data.offset,
        limit: data.limit,
        sort: data.mode === "best_sellers" ? "relevance" : "relevance",
      },
      token ?? undefined,
    );
  });

/** Add many products by MLB id. */
export const addMLProductsByIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ids: z.array(z.string().min(3)).min(1).max(50) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const token = await loadToken(context.userId);
    const tag = await loadAffiliateTag(context.supabase, context.userId);

    const items: MLItem[] = [];
    const CONC = 6;
    let cursor = 0;
    const worker = async () => {
      while (cursor < data.ids.length) {
        const idx = cursor++;
        const id = data.ids[idx]!;
        try {
          const item = await getItemById(id, token);
          if (item) items.push(item);
        } catch (e) {
          console.error("[ML][addByIds] falha", id, e instanceof Error ? e.message : e);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONC, data.ids.length) }, () => worker()));

    if (items.length === 0) return { inserted: 0, updated: 0, failed: data.ids.length };

    const batch = items.map((i) => toUpsert(context.userId, i, tag));
    const outcome = await upsertProducts(context.supabase, context.userId, batch);
    return { ...outcome, failed: data.ids.length - items.length };
  });
