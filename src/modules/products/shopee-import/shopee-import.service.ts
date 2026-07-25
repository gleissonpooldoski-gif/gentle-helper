/**
 * Orchestrates a single-batch upsert of Shopee products, escopado por grupo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ShopeeCsvRow } from "./csv.processor";
import { mapRowToProduct } from "./product.mapper";
import { upsertBatch, type BatchOutcome } from "./repository";
import { isRealProductImage } from "./image-resolver";

export async function importBatch(
  supabase: SupabaseClient<Database>,
  userId: string,
  channelId: string | null,
  sourceGroupJid: string,
  sourceGroupName: string | null,
  rows: ShopeeCsvRow[],
): Promise<BatchOutcome> {
  const normalized = rows.map((r) => ({
    ...r,
    imageUrl: isRealProductImage(r.imageUrl) ? r.imageUrl : null,
  }));
  const payload = normalized.map((r) =>
    mapRowToProduct(userId, channelId, sourceGroupJid, sourceGroupName, r),
  );
  return upsertBatch(supabase, userId, channelId, payload);
}
