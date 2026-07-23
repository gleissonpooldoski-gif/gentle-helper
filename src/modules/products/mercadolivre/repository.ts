/**
 * Persists Mercado Livre products, upserting on (user_id, platform, item_id).
 * Reuses the shared `products` table with platform = 'mercadolivre'.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type MLProductUpsert = {
  user_id: string;
  platform: "mercadolivre";
  item_id: string; // MLBxxxxx
  title: string;
  store_name: string | null;
  original_price: number | null;
  promo_price: number | null;
  sales: number | null;
  commission_rate: number | null;
  commission_value: number | null;
  raw_link: string;
  affiliate_link: string;
  image_url: string | null;
};

export type UpsertOutcome = { inserted: number; updated: number };

export async function upsertProducts(
  supabase: SupabaseClient<Database>,
  userId: string,
  batch: MLProductUpsert[],
): Promise<UpsertOutcome> {
  if (batch.length === 0) return { inserted: 0, updated: 0 };

  const ids = batch.map((b) => b.item_id);
  const { data: existing, error: exErr } = await supabase
    .from("products")
    .select("item_id")
    .eq("user_id", userId)
    .eq("platform", "mercadolivre")
    .in("item_id", ids);
  if (exErr) throw new Error(`Falha ao consultar produtos: ${exErr.message}`);

  const existingSet = new Set((existing ?? []).map((r) => r.item_id as string));

  const { error: upErr } = await supabase
    .from("products")
    .upsert(batch as never, { onConflict: "user_id,platform,item_id" });
  if (upErr) throw new Error(`Falha ao gravar produtos: ${upErr.message}`);

  const updated = batch.filter((b) => existingSet.has(b.item_id)).length;
  return { inserted: batch.length - updated, updated };
}
