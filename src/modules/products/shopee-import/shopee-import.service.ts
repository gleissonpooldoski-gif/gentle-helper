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
  // Priority: Shopee API (by Item Id) → CSV field → page scrape.
  // Query the API for every row that has a product URL, so we can extract shop id.
  const lookups = rows
    .filter((r) => r.itemId && r.productUrl)
    .map((r) => ({ itemId: r.itemId, productUrl: r.productUrl }));
  const resolved = lookups.length > 0 ? await resolveImages(lookups) : new Map<string, string>();

  const candidates: Array<{ row: ShopeeCsvRow; candidate: string | null }> = rows.map((r) => ({
    row: r,
    candidate: resolved.get(r.itemId) ?? r.imageUrl ?? null,
  }));

  // Validate reachability in parallel (best-effort, bounded timeout).
  const validated = await Promise.all(
    candidates.map(async ({ row, candidate }) => {
      const url = isValidHttpUrl(candidate) ? await verifyReachable(candidate) : null;
      return { ...row, imageUrl: url };
    }),
  );

  const payload = validated.map((r) => mapRowToProduct(userId, r));
  return upsertBatch(supabase, userId, payload);
}

function isValidHttpUrl(v: string | null): v is string {
  if (!v) return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function verifyReachable(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    // Some CDNs reject HEAD — retry with a tiny ranged GET.
    if (!res.ok || res.status === 405) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { range: "bytes=0-0" },
      });
    }
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct && !ct.startsWith("image/") && ct !== "application/octet-stream") return null;
    return url;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
