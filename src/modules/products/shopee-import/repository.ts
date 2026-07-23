/**
 * Persists Shopee products in batches, upserting on (user_id, platform, item_id).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ShopeeProductUpsert } from "./product.mapper";

export type BatchOutcome = { inserted: number; updated: number };

export async function upsertBatch(
  supabase: SupabaseClient<Database>,
  userId: string,
  batch: ShopeeProductUpsert[],
): Promise<BatchOutcome> {
  if (batch.length === 0) return { inserted: 0, updated: 0 };

  const itemIds = batch.map((b) => b.item_id);
  const { data: existing, error: existingErr } = await supabase
    .from("products")
    .select("item_id")
    .eq("user_id", userId)
    .eq("platform", "shopee")
    .in("item_id", itemIds);

  if (existingErr) {
    throw new Error(`Falha ao consultar produtos existentes: ${existingErr.message}`);
  }

  const existingSet = new Set((existing ?? []).map((r) => r.item_id as string));

  const { error: upsertErr } = await supabase
    .from("products")
    // @ts-expect-error - generated types may not include new columns yet
    .upsert(batch, { onConflict: "user_id,platform,item_id" });

  if (upsertErr) {
    throw new Error(`Falha ao gravar produtos: ${upsertErr.message}`);
  }

  const updated = batch.filter((b) => existingSet.has(b.item_id)).length;
  return { inserted: batch.length - updated, updated };
}
