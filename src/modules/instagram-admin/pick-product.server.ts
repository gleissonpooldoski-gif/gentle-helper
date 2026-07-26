import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type StoryProduct = {
  id: string;
  title: string;
  image_url: string | null;
  affiliate_link: string | null;
  raw_link: string | null;
  promo_price: number | null;
  original_price: number | null;
  channel_id: string | null;
  source_group_jid: string | null;
};

/**
 * Picks a product for Story publishing, rotating across ALL groups/channels.
 * - Excludes products published in the last 24h (via instagram_campaigns).
 * - Prioritizes discounted products; falls back to any active product.
 * - Randomizes selection so different groups/channels get exposure over time.
 */
export async function pickStoryProduct(): Promise<StoryProduct | null> {
  // Recently used product IDs (last 24h) to avoid repetition
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("instagram_campaigns")
    .select("product_id")
    .gte("published_at", since)
    .not("product_id", "is", null);
  const usedIds = new Set(
    ((recent as any[]) ?? []).map((r) => r.product_id).filter(Boolean),
  );

  const baseCols =
    "id,title,image_url,affiliate_link,raw_link,promo_price,original_price,channel_id,source_group_jid";

  // Pull a wide pool then sample client-side so all groups are represented.
  const tryFetch = async (discountOnly: boolean) => {
    const q = supabaseAdmin
      .from("products")
      .select(baseCols)
      .eq("availability", "active")
      .not("image_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);
    if (discountOnly) q.eq("is_discount", true);
    const { data } = await q;
    return ((data as any[]) ?? []) as StoryProduct[];
  };

  const pickFromPool = (pool: StoryProduct[]): StoryProduct | null => {
    const fresh = pool.filter((p) => !usedIds.has(p.id));
    const candidates = fresh.length ? fresh : pool;
    if (!candidates.length) return null;

    // Group by (channel_id + source_group_jid) so each group weighs equally.
    const buckets = new Map<string, StoryProduct[]>();
    for (const p of candidates) {
      const key = `${p.channel_id ?? "null"}::${p.source_group_jid ?? "null"}`;
      const arr = buckets.get(key) ?? [];
      arr.push(p);
      buckets.set(key, arr);
    }
    const keys = Array.from(buckets.keys());
    const bucket = buckets.get(keys[Math.floor(Math.random() * keys.length)])!;
    return bucket[Math.floor(Math.random() * bucket.length)];
  };

  const discounted = await tryFetch(true);
  const picked = pickFromPool(discounted);
  if (picked) return picked;

  const any = await tryFetch(false);
  return pickFromPool(any);
}
