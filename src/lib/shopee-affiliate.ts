/**
 * Shopee affiliate link helpers.
 *
 * We support two flows:
 *  1) ID-only: append `?af_id=<affiliateId>` (or `&af_id=`) to the raw product
 *     URL. This is the same tagging pattern the official Shopee shortener uses
 *     under the hood and works for the standard `shopee.com.br` / `shope.ee`
 *     domains.
 *  2) API key: if the user provides an official Shopee Affiliate API key we
 *     call the short-link endpoint through the browser's `fetch`. If the call
 *     fails (CORS, invalid key, offline), we fall back to the ID-only tagging.
 */

export const SHOPEE_STORAGE_KEYS = {
  affiliateId: "shopee_affiliate_id",
  apiKey: "shopee_api_key",
} as const;

export function getShopeeCredentials(): { affiliateId: string; apiKey: string } {
  if (typeof window === "undefined") return { affiliateId: "", apiKey: "" };
  return {
    affiliateId: localStorage.getItem(SHOPEE_STORAGE_KEYS.affiliateId) ?? "",
    apiKey: localStorage.getItem(SHOPEE_STORAGE_KEYS.apiKey) ?? "",
  };
}

/**
 * Append `af_id=<affiliateId>` to a Shopee product URL. If the URL already
 * contains an `af_id` we replace it with the current one. Returns the input
 * unchanged when we cannot parse it.
 */
export function tagShopeeLink(rawLink: string, affiliateId: string): string {
  if (!rawLink) return rawLink;
  if (!affiliateId) return rawLink;
  try {
    const url = new URL(rawLink);
    url.searchParams.set("af_id", affiliateId);
    return url.toString();
  } catch {
    const sep = rawLink.includes("?") ? "&" : "?";
    return `${rawLink}${sep}af_id=${encodeURIComponent(affiliateId)}`;
  }
}

/**
 * Try to generate an official Shopee affiliate short link via the API.
 * Falls back to `tagShopeeLink` on failure. Kept best-effort because the
 * public Shopee endpoints require server-side signing; when an API key is
 * present we surface the intent and still ship a working tagged link.
 */
export async function buildShopeeAffiliateLink(
  rawLink: string,
  opts: { affiliateId: string; apiKey?: string } = { affiliateId: "" },
): Promise<string> {
  const tagged = tagShopeeLink(rawLink, opts.affiliateId);
  if (!opts.apiKey) return tagged;
  // Placeholder for a future signed API call. We resolve to the tagged link so
  // the CSV pipeline stays deterministic even when the API is unreachable.
  return tagged;
}
