/**
 * MagaluAffiliateService
 *
 * Pure business logic. Side effects (Supabase client) are injected.
 * Never imports client-only modules.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeStoreName, computeStatus, type MagaluStatus } from "./validator";
import { findConnection, upsertConnection, type MagaluConnectionRow } from "./repository";

export type MagaluConnectionView = {
  storeName: string;
  status: MagaluStatus;
  lastError: string | null;
  updatedAt: string | null;
};

function toView(row: MagaluConnectionRow | null): MagaluConnectionView | null {
  if (!row) return null;
  return {
    storeName: row.store_name ?? "",
    status: (row.status as MagaluStatus) ?? "pending",
    lastError: row.last_error,
    updatedAt: row.updated_at,
  };
}

export async function getConnection(
  supabase: SupabaseClient,
  userId: string,
): Promise<MagaluConnectionView | null> {
  return toView(await findConnection(supabase, userId));
}

export async function saveConnection(
  supabase: SupabaseClient,
  userId: string,
  input: { storeName: string },
): Promise<MagaluConnectionView> {
  const storeName = normalizeStoreName(input.storeName);
  const { status, error } = computeStatus(storeName);
  const row = await upsertConnection(supabase, userId, {
    store_name: storeName,
    status,
    last_error: error,
  });
  return toView(row)!;
}

/**
 * Gera o link comissionado Magalu para uma URL de produto,
 * injetando o `partner_id` (nome da loja) na querystring — padrão
 * aceito pelo Magalu Parceiros para atribuição da comissão.
 */
export function buildMagaluAffiliateUrl(productUrl: string, storeName: string): string {
  const partner = normalizeStoreName(storeName);
  if (!partner) return productUrl;
  try {
    const u = new URL(productUrl);
    u.searchParams.set("partner_id", partner);
    return u.toString();
  } catch {
    const sep = productUrl.includes("?") ? "&" : "?";
    return `${productUrl}${sep}partner_id=${encodeURIComponent(partner)}`;
  }
}

export async function generateAffiliateUrl(
  supabase: SupabaseClient,
  userId: string,
  productUrl: string,
): Promise<{ affiliateUrl: string; status: MagaluStatus }> {
  const row = await findConnection(supabase, userId);
  const storeName = row?.store_name ?? "";
  if (!storeName) {
    return { affiliateUrl: productUrl, status: "pending" };
  }
  return {
    affiliateUrl: buildMagaluAffiliateUrl(productUrl, storeName),
    status: (row?.status as MagaluStatus) ?? "connected",
  };
}
