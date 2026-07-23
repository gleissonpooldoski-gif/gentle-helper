/**
 * MercadoLivreAffiliateService
 *
 * Pure business logic. All side effects are injected (supabase client,
 * fetcher for redirect resolution). Never imports client-only modules.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptSecret, decryptSecret } from "@/modules/affiliate/crypto.server";
import {
  extractAffiliateTag,
  computeStatus,
  type ConnectionStatus,
} from "./validator";
import { findConnection, upsertConnection, updateStatus } from "./repository";

export type MLConnectionView = {
  affiliateLink: string;
  affiliateTag: string | null;
  hasCookie: boolean;
  status: ConnectionStatus;
  lastError: string | null;
  updatedAt: string | null;
};

/**
 * Try to resolve a short `/sec/...` link by following redirects and
 * re-extracting the tag from the final URL. Best effort.
 */
async function resolveTagFromShortLink(link: string): Promise<string | null> {
  try {
    const res = await fetch(link, {
      method: "GET",
      redirect: "follow",
      // Some ML endpoints refuse without a UA.
      headers: { "user-agent": "Mozilla/5.0 (compatible; DivulgaLinksBot/1.0)" },
    });
    return extractAffiliateTag(res.url);
  } catch {
    return null;
  }
}

async function toView(
  row: {
    affiliate_link: string | null;
    cookie_encrypted: string | null;
    affiliate_tag: string | null;
    status: string;
    last_error: string | null;
    updated_at: string;
  } | null,
): Promise<MLConnectionView | null> {
  if (!row) return null;
  return {
    affiliateLink: row.affiliate_link ?? "",
    affiliateTag: row.affiliate_tag,
    hasCookie: !!row.cookie_encrypted,
    status: (row.status as ConnectionStatus) ?? "pending",
    lastError: row.last_error,
    updatedAt: row.updated_at,
  };
}

export async function getConnection(
  supabase: SupabaseClient,
  userId: string,
): Promise<MLConnectionView | null> {
  return toView(await findConnection(supabase, userId));
}

export async function saveConnection(
  supabase: SupabaseClient,
  userId: string,
  input: { affiliateLink: string; cookie?: string; clearCookie?: boolean },
): Promise<MLConnectionView> {
  const affiliateLink = input.affiliateLink.trim();
  let tag = extractAffiliateTag(affiliateLink);
  if (!tag) tag = await resolveTagFromShortLink(affiliateLink);

  const existing = await findConnection(supabase, userId);
  const cookiePlain = input.cookie?.trim() ?? "";
  let cookieEncrypted: string | null;
  if (input.clearCookie) {
    cookieEncrypted = null;
  } else if (cookiePlain) {
    cookieEncrypted = encryptSecret(cookiePlain);
  } else {
    cookieEncrypted = existing?.cookie_encrypted ?? null;
  }

  const { status, error } = computeStatus({
    affiliateLink,
    cookie: cookieEncrypted ? "present" : null,
    tag,
  });

  const row = await upsertConnection(supabase, userId, {
    affiliate_link: affiliateLink,
    cookie_encrypted: cookieEncrypted,
    affiliate_tag: tag,
    status,
    last_error: error,
  });
  const view = await toView(row);
  return view!;
}

/**
 * Generate a commissioned URL for a Mercado Livre product using the
 * user's stored affiliate tag. Cookie is decrypted for future use with the
 * official generator; we do not send it from the browser.
 */
export async function generateAffiliateUrl(
  supabase: SupabaseClient,
  userId: string,
  productUrl: string,
): Promise<{ affiliateUrl: string; status: ConnectionStatus }> {
  const row = await findConnection(supabase, userId);
  if (!row?.affiliate_tag) {
    throw new Error("Configuração Mercado Livre não encontrada ou sem tag.");
  }

  // Decrypt to prove the stored cookie is still readable; if we can't decrypt
  // (secret rotated) flag as cookie_expired instead of throwing.
  if (row.cookie_encrypted) {
    try {
      decryptSecret(row.cookie_encrypted);
    } catch {
      await updateStatus(supabase, userId, "cookie_expired", "Cookie inválido — atualize.");
      return { affiliateUrl: productUrl, status: "cookie_expired" };
    }
  }

  let affiliateUrl = productUrl;
  try {
    const u = new URL(productUrl);
    u.searchParams.set("matt_word", row.affiliate_tag);
    u.searchParams.set("matt_tool", row.affiliate_tag);
    affiliateUrl = u.toString();
  } catch {
    const sep = productUrl.includes("?") ? "&" : "?";
    affiliateUrl = `${productUrl}${sep}matt_word=${encodeURIComponent(row.affiliate_tag)}`;
  }

  return { affiliateUrl, status: (row.status as ConnectionStatus) ?? "connected" };
}
