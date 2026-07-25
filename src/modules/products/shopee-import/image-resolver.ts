/**
 * Image extractor for Shopee product pages.
 *
 * Insight: Shopee returns a full-blown SPA shell (zero product markup) for
 * regular desktop browsers and blocks the internal /api/v4/pdp/get_pc route
 * for non-authenticated clients. It DOES render meta tags (og:image /
 * twitter:image) when the request User-Agent looks like WhatsApp / Facebook
 * / Telegram (link-preview bots). We piggyback on that.
 *
 * Strategy (best-effort, never throws, never blocks import):
 *   1. Fetch product URL with a WhatsApp-bot UA → parse og:image / twitter:image.
 *   2. Fall back to the affiliate short URL with the same UA (also renders OG).
 *   3. Fall back to desktop UA + broad HTML scan.
 *   4. Validate the resulting URL: must be a real Shopee CDN image
 *      (susercontent / cf.shopee / shopeemobile) and NOT a known placeholder
 *      (default flyer / logo / bag).
 *   5. On total failure → return null. Caller keeps image_url = null so the
 *      product is treated as PENDING (retried on next enrichment sweep).
 */

const FETCH_TIMEOUT_MS = 5_000;
const CONCURRENCY = 8;

const UA_WHATSAPP = "WhatsApp/2.24.0.85 A";
const UA_FACEBOOK =
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const UA_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.127 Safari/537.36";

const BASE_HEADERS: Record<string, string> = {
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "accept-language": "pt-BR,pt;q=0.9,en;q=0.7",
};

/**
 * Placeholder / non-product images Shopee sometimes returns.
 * Adding new patterns here is safe — only affects validation.
 */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /placeholder/i,
  /default[_-]?image/i,
  /no[_-]?image/i,
  /shopee[_-]?logo/i,
  /\/logo\//i,
  /favicon/i,
  /icon[_-]?app/i,
  /shopee[_-]?bag/i,
  /shopping[_-]?bag/i,
  /flyer/i,
];

/** Only accept URLs served by known Shopee product-image CDNs. */
// Accept any number of subdomains (e.g. down-br.img.susercontent.com).
const VALID_CDN_HOST_RE =
  /^https?:\/\/(?:[a-z0-9-]+\.)*(?:susercontent\.com|cf\.shopee\.[a-z.]+|shopeemobile\.com)\//i;

export type ImageLookup = { itemId: string; productUrl: string; offerUrl?: string | null };

async function fetchText(
  url: string,
  ua: string,
  extra: Record<string, string> = {},
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { ...BASE_HEADERS, "user-agent": ua, ...extra },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function isValidProductImage(url: string): boolean {
  if (!VALID_CDN_HOST_RE.test(url)) return false;
  for (const re of PLACEHOLDER_PATTERNS) if (re.test(url)) return false;
  return true;
}

/** Extract og:image / twitter:image / link[rel=image_src]. */
function findMetaImage(html: string): string | null {
  const patterns: RegExp[] = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Broad CDN URL scan (fallback for HTML that doesn't emit OG tags). */
function findCdnUrl(html: string): string | null {
  const re =
    /https?:\/\/(?:[a-z0-9-]+\.)*(?:susercontent\.com|cf\.shopee\.[a-z.]+|shopeemobile\.com)\/file\/[a-z0-9_-]+(?:_tn)?/gi;
  const matches = html.match(re);
  if (!matches) return null;
  for (const url of matches) if (isValidProductImage(url)) return url;
  return null;
}

type Attempt = { method: string; image: string | null };

function extractFromHtml(html: string, methodTag: string): Attempt {
  const og = findMetaImage(html);
  if (og && isValidProductImage(og)) return { method: `${methodTag}:og`, image: og };

  const cdn = findCdnUrl(html);
  if (cdn) return { method: `${methodTag}:cdn`, image: cdn };

  return { method: `${methodTag}:none`, image: og && !isValidProductImage(og) ? null : null };
}

function logAttempt(url: string, attempt: Attempt): void {
   
  console.log(
    "[shopee-image] Produto analisado\n" +
      `  URL: ${url}\n` +
      `  Método: ${attempt.method}\n` +
      `  Imagem: ${attempt.image ?? "null"}\n` +
      `  Status: ${attempt.image ? "saved" : "pending"}`,
  );
}

async function tryUrl(url: string, ua: string, tag: string): Promise<Attempt> {
  const html = await fetchText(url, ua);
  if (!html) return { method: `${tag}:fetch-fail`, image: null };
  return extractFromHtml(html, tag);
}

/**
 * Single-URL scrape used by the background enrichment job.
 * Never throws. Returns null → caller keeps image_url pending.
 */
export async function scrapeShopeeImage(
  productUrl: string,
  offerUrl?: string | null,
): Promise<string | null> {
  try {
    // Ordem: WhatsApp UA (mais confiável) → Facebook UA como fallback.
    // O desktop UA quase nunca traz OG quando WA+FB já falharam, então
    // deixamos ele fora do caminho quente para não desperdiçar timeout.
    const attempts: Array<{ url: string; ua: string; tag: string }> = [
      { url: productUrl, ua: UA_WHATSAPP, tag: "product-wa" },
    ];
    if (offerUrl && offerUrl !== productUrl) {
      attempts.push({ url: offerUrl, ua: UA_WHATSAPP, tag: "offer-wa" });
    }
    attempts.push({ url: productUrl, ua: UA_FACEBOOK, tag: "product-fb" });

    for (const a of attempts) {
      const attempt = await tryUrl(a.url, a.ua, a.tag);
      if (attempt.image) {
        logAttempt(a.url, attempt);
        return attempt.image;
      }
    }
    logAttempt(productUrl, { method: "all-failed", image: null });
    return null;
  } catch (err) {
    logAttempt(productUrl, { method: `error:${(err as Error).message}`, image: null });
    return null;
  }
}

/**
 * Batch resolver with bounded concurrency. Returns a map keyed by itemId.
 */
export async function resolveImages(lookups: ImageLookup[]): Promise<Map<string, string>> {
  const seen = new Set<string>();
  const unique: ImageLookup[] = [];
  for (const l of lookups) {
    if (!l.itemId || seen.has(l.itemId)) continue;
    seen.add(l.itemId);
    unique.push(l);
  }

  const result = new Map<string, string>();
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < unique.length) {
      const idx = cursor++;
      const lookup = unique[idx]!;
      const image = await scrapeShopeeImage(lookup.productUrl, lookup.offerUrl);
      if (image) result.set(lookup.itemId, image);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, unique.length) }, () => worker()),
  );
  return result;
}

/** Exposed for CSV import — reject placeholder URLs before persisting. */
export function isRealProductImage(url: string | null | undefined): boolean {
  if (!url) return false;
  return isValidProductImage(url);
}
