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

export async function importBatch(
  supabase: SupabaseClient<Database>,
  userId: string,
  rows: ShopeeCsvRow[],
): Promise<BatchOutcome> {
  const normalized = rows.map((r) => ({
    ...r,
    imageUrl: isValidHttpUrl(r.imageUrl) ? r.imageUrl : null,
  }));
  const payload = normalized.map((r) => mapRowToProduct(userId, r));
  return upsertBatch(supabase, userId, payload);
}

function isValidHttpUrl(v: string | null | undefined): v is string {
  if (!v) return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
