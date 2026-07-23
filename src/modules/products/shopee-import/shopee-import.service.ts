/**
 * Orchestrates a single-batch upsert of Shopee products.
 * Batching + progress happens on the client (see controller.functions.ts).
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
  const payload = rows.map((r) => mapRowToProduct(userId, r));
  return upsertBatch(supabase, userId, payload);
}
