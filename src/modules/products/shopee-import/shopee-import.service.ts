/**
 * Orchestrates a single-batch upsert of Shopee products.
 * Image enrichment is deferred: rows are saved with the CSV image (if any),
 * otherwise image_url = null. A background job fills in missing images after import.
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
  rows: ShopeeCsvRow[],
): Promise<BatchOutcome> {
  const normalized = rows.map((r) => ({
    ...r,
    // Only accept CSV images that come from a real Shopee product CDN and
    // are NOT known placeholders. Everything else → null (pending), so the
    // background enricher will fetch the real og:image.
    imageUrl: isRealProductImage(r.imageUrl) ? r.imageUrl : null,
  }));
  const payload = normalized.map((r) => mapRowToProduct(userId, r));
  return upsertBatch(supabase, userId, payload);
}

