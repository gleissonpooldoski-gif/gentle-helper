/**
 * Envolve URLs de produto com o site DvLinks do CANAL (grupo)
 * quando as opções correspondentes estiverem ativas.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type SiteConfigRow = {
  slug: string;
  use_for_amazon_ml: boolean;
  use_for_all: boolean;
};

const REDIRECT_PATH = "/g"; // /g/{slug}/r?to=<url>

function detectPlatform(url: string): "amazon" | "mercadolivre" | "shopee" | "aliexpress" | "magalu" | "other" {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (/amazon\.|amzn\.to/.test(host)) return "amazon";
    if (/mercadoli(vre|bre)|mlb\./.test(host)) return "mercadolivre";
    if (/shopee|shope\.ee/.test(host)) return "shopee";
    if (/aliexpress/.test(host)) return "aliexpress";
    if (/magalu|magazineluiza|magazinevoce/.test(host)) return "magalu";
    return "other";
  } catch {
    return "other";
  }
}

function buildOrigin(): string {
  const envUrl = (process.env.PUBLIC_SITE_URL ?? process.env.VITE_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  return envUrl || "";
}

export function wrapLinkWithSite(url: string, cfg: SiteConfigRow | null): string {
  if (!url || !cfg) return url;
  const platform = detectPlatform(url);
  const shouldWrap =
    cfg.use_for_all ||
    (cfg.use_for_amazon_ml && (platform === "amazon" || platform === "mercadolivre"));
  if (!shouldWrap) return url;
  const origin = buildOrigin();
  const path = `${REDIRECT_PATH}/${cfg.slug}/r?to=${encodeURIComponent(url)}`;
  return origin ? `${origin}${path}` : path;
}

export async function loadSiteConfigByChannel(
  supabase: SupabaseClient<Database>,
  channelId: string,
): Promise<SiteConfigRow | null> {
  const { data } = await supabase
    .from("site_configs")
    .select("slug, use_for_amazon_ml, use_for_all")
    .eq("channel_id", channelId)
    .maybeSingle();
  return (data as SiteConfigRow | null) ?? null;
}
