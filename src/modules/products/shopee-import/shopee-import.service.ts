/**
 * Orchestrates a single-batch upsert of Shopee products.
 * Batching + progress happens on the client (see controller.functions.ts).
 * Rows missing an image are enriched by scraping the Product Link (best-effort).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ShopeeCsvRow } from "./csv.processor";
import { mapRowToProduct } from "./product.mapper";
import { upsertBatch, type BatchOutcome } from "./repository";
import { resolveImages } from "./image-resolver";

export async function importBatch(
  supabase: SupabaseClient<Database>,
  userId: string,
  rows: ShopeeCsvRow[],
): Promise<BatchOutcome> {
  const missing = rows.filter((r) => !r.imageUrl && r.productUrl).map((r) => r.productUrl);
  const resolved = missing.length > 0 ? await resolveImages(missing) : new Map<string, string>();

  const enriched: ShopeeCsvRow[] = rows.map((r) =>
    r.imageUrl ? r : { ...r, imageUrl: resolved.get(r.productUrl) ?? null },
  );

  const payload = enriched.map((r) => mapRowToProduct(userId, r));
  return upsertBatch(supabase, userId, payload);
}
