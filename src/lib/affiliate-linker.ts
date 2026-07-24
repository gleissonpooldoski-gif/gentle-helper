/**
 * Client-side affiliate URL enforcement for the manual post form.
 * Detects the marketplace from the URL and, if the link is missing the
 * user's affiliate identifier, appends it before persisting.
 */
import { tagShopeeLink, getShopeeCredentials } from "@/lib/shopee-affiliate";
import { getMagaluStoreName } from "@/modules/affiliate/magalu/local-store";
import { buildMagaluAffiliateUrl } from "@/modules/affiliate/magalu/service";
import { buildMLAffiliateUrl } from "@/modules/affiliate/mercado-livre/controller.functions";

export type Platform = "shopee" | "mercadolivre" | "magalu" | "other";

export function detectPlatform(rawUrl: string): Platform {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (host.includes("shopee") || host.includes("shope.ee")) return "shopee";
    if (host.includes("mercadoli") || host.includes("mlb") || host.includes("mercadolibre")) return "mercadolivre";
    if (host.includes("magazineluiza") || host.includes("magazinevoce") || host.includes("magalu")) return "magalu";
    return "other";
  } catch {
    return "other";
  }
}

function hasParam(url: string, key: string): boolean {
  try {
    return new URL(url).searchParams.has(key);
  } catch {
    return new RegExp(`[?&]${key}=`).test(url);
  }
}

export type EnsureResult = {
  url: string;
  platform: Platform;
  tagged: boolean;
  missing?: string; // error message when the platform requires an affiliate id but it's not configured
};

export async function ensureAffiliateLink(
  rawUrl: string,
  callBuildML: (input: { productUrl: string }) => Promise<{ affiliateUrl: string }>,
): Promise<EnsureResult> {
  const url = rawUrl.trim();
  if (!url) return { url, platform: "other", tagged: false };
  const platform = detectPlatform(url);

  if (platform === "shopee") {
    if (hasParam(url, "af_id") || hasParam(url, "smtt")) return { url, platform, tagged: false };
    const { affiliateId } = getShopeeCredentials();
    if (!affiliateId) return { url, platform, tagged: false, missing: "Configure seu Shopee ID de Afiliado em Config. Afiliados." };
    return { url: tagShopeeLink(url, affiliateId), platform, tagged: true };
  }

  if (platform === "magalu") {
    if (hasParam(url, "partner_id")) return { url, platform, tagged: false };
    const store = getMagaluStoreName();
    if (!store) return { url, platform, tagged: false, missing: "Configure sua loja Magalu em Config. Afiliados." };
    return { url: buildMagaluAffiliateUrl(url, store), platform, tagged: true };
  }

  if (platform === "mercadolivre") {
    // ML tags are opaque; delegate to server helper which uses saved connection.
    if (/matt_tool|matt_word|tracking_id/i.test(url)) return { url, platform, tagged: false };
    try {
      const { affiliateUrl } = await callBuildML({ productUrl: url });
      if (affiliateUrl && affiliateUrl !== url) return { url: affiliateUrl, platform, tagged: true };
      return { url, platform, tagged: false, missing: "Conecte sua conta Mercado Livre em Config. Afiliados." };
    } catch {
      return { url, platform, tagged: false, missing: "Não foi possível aplicar o link de afiliado do Mercado Livre." };
    }
  }

  return { url, platform, tagged: false };
}

// Re-export for callers that need to invoke the server fn through useServerFn.
export { buildMLAffiliateUrl };
