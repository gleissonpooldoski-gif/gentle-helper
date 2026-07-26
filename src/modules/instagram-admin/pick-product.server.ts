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
    "id,title,image_url,affiliate_link,raw_link,promo_price,original_price,is_discount,channel_id,source_group_jid";

  // Pull a wide pool of ALL active products, then rotate across groups client-side.
  // Fetching discounted-only first was skewing to whichever group had discounts;
  // now every group gets equal weight and discounts are only a within-bucket preference.
  const { data } = await supabaseAdmin
    .from("products")
    .select(baseCols)
    .eq("availability", "active")
    .not("image_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(2000);
  const pool = ((data as any[]) ?? []) as (StoryProduct & { is_discount?: boolean })[];
  if (!pool.length) return null;

  // Group by (channel_id + source_group_jid) so each group weighs equally.
  const buckets = new Map<string, (StoryProduct & { is_discount?: boolean })[]>();
  for (const p of pool) {
    const key = `${p.channel_id ?? "null"}::${p.source_group_jid ?? "null"}`;
    const arr = buckets.get(key) ?? [];
    arr.push(p);
    buckets.set(key, arr);
  }

  // Shuffle bucket order so no group is favored.
  const keys = Array.from(buckets.keys()).sort(() => Math.random() - 0.5);

  for (const key of keys) {
    const items = buckets.get(key)!;
    const fresh = items.filter((p) => !usedIds.has(p.id));
    const pickList = fresh.length ? fresh : items;
    // Prefer discounted within the chosen bucket, but never skip the bucket if none.
    const discounted = pickList.filter((p) => p.is_discount);
    const chosen = discounted.length ? discounted : pickList;
    if (chosen.length) return chosen[Math.floor(Math.random() * chosen.length)];
  }
  return null;
}
