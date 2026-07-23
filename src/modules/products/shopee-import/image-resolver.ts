/**
 * Multi-layer image extractor for Shopee product pages.
 *
 * Strategy (all best-effort — never throws, never blocks import):
 *   1. Fetch full HTML with a real browser User-Agent (desktop, then mobile).
 *   2. Search for patterns, in order:
 *      a. Full CDN URLs   → https://cf.shopee.com.br/file/<hash>
 *                            https://down-*.img.susercontent.com/file/<hash>
 *      b. JSON fields     → "image":"<hash>", "images":["<hash>", ...],
 *                            image_id / imageId
 *      c. `br-xxxxxxxx` short hashes anywhere in the HTML
 *      d. og:image / twitter:image / link[rel=image_src]
 *   3. When only a hash is found, build https://cf.shopee.com.br/file/<hash>.
 *   4. On total failure → return null. Caller keeps image_url = null so the
 *      product is treated as PENDING (retried on next enrichment sweep),
 *      not as a permanent error.
 *
 * Every attempt is logged with the following shape (server console):
 *   [shopee-image] Produto analisado
 *     URL: <productUrl>
 *     Método encontrado: <method | none>
 *     Imagem encontrada: <url | null>
 *     Imagem salva: <yes/pending>
 */

const FETCH_TIMEOUT_MS = 8_000;
const CONCURRENCY = 6;

// Real Chrome desktop + iOS Safari UAs (matches production browsers).
const UA_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.127 Safari/537.36";
const UA_MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const BROWSER_HEADERS: Record<string, string> = {
  "user-agent": UA_DESKTOP,
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  "accept-encoding": "gzip, deflate, br",
  "cache-control": "no-cache",
  pragma: "no-cache",
  "sec-ch-ua": '"Chromium";v="126", "Google Chrome";v="126", "Not-A.Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
};

export type ImageLookup = { itemId: string; productUrl: string };

async function fetchText(
  url: string,
  extra: Record<string, string> = {},
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { ...BROWSER_HEADERS, ...extra },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Build a CDN URL from either a full URL or a bare hash. */
function toShopeeImageUrl(hashOrUrl: string): string {
  const v = hashOrUrl.trim();
  if (/^https?:\/\//i.test(v)) return v;
  return `https://cf.shopee.com.br/file/${v}`;
}

// ============================================================
//  Extraction layers
// ============================================================

/** (a) Full CDN URLs already present in the HTML. */
const CDN_URL_RE =
  /https?:\/\/(?:cf\.shopee\.com\.br|down-[a-z0-9-]+\.img\.susercontent\.com|cf\.shopee\.[a-z.]+)\/file\/[a-z0-9_-]+(?:_tn)?/i;

function findCdnUrl(html: string): string | null {
  const m = html.match(CDN_URL_RE);
  return m?.[0] ?? null;
}

/** (b) JSON-embedded hashes: "image", "images", image_id, imageId. */
function findJsonHash(html: string): string | null {
  const patterns: RegExp[] = [
    /"image"\s*:\s*"([a-z0-9_-]{16,})"/i,
    /"images"\s*:\s*\[\s*"([a-z0-9_-]{16,})"/i,
    /"image_id"\s*:\s*"([a-z0-9_-]{16,})"/i,
    /"imageId"\s*:\s*"([a-z0-9_-]{16,})"/i,
    /"cover"\s*:\s*"([a-z0-9_-]{16,})"/i,
    /"thumbnail"\s*:\s*"([a-z0-9_-]{16,})"/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** (c) Bare `br-xxxxxxxx…` hashes anywhere in the HTML. */
function findBareHash(html: string): string | null {
  const m = html.match(/\b(br-[a-z0-9]{6,})\b/i);
  return m?.[1] ?? null;
}

/** (d) Open-Graph / Twitter / link[rel=image_src]. */
function findMetaImage(html: string): string | null {
  const patterns: RegExp[] = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

type Attempt = { method: string; image: string | null };

function extractFromHtml(html: string): Attempt {
  const cdn = findCdnUrl(html);
  if (cdn) return { method: "cdn-url", image: cdn };

  const jsonHash = findJsonHash(html);
  if (jsonHash) return { method: "json-hash", image: toShopeeImageUrl(jsonHash) };

  const bare = findBareHash(html);
  if (bare) return { method: "bare-hash", image: toShopeeImageUrl(bare) };

  const meta = findMetaImage(html);
  if (meta) return { method: "og-image", image: meta };

  return { method: "none", image: null };
}

function logAttempt(productUrl: string, attempt: Attempt): void {
  // Structured server-side log so operators can trace failures per product.
   
  console.log(
    "[shopee-image] Produto analisado\n" +
      `  URL: ${productUrl}\n` +
      `  Método encontrado: ${attempt.method}\n` +
      `  Imagem encontrada: ${attempt.image ?? "null"}\n` +
      `  Imagem salva: ${attempt.image ? "yes" : "pending"}`,
  );
}

async function tryPageScrape(productUrl: string): Promise<Attempt> {
  // Desktop UA first, then mobile as fallback (some Shopee pages render
  // different markup per device).
  const desktopHtml = await fetchText(productUrl);
  if (desktopHtml) {
    const a = extractFromHtml(desktopHtml);
    if (a.image) return a;
  }
  const mobileHtml = await fetchText(productUrl, { "user-agent": UA_MOBILE });
  if (mobileHtml) {
    const a = extractFromHtml(mobileHtml);
    if (a.image) return a;
  }
  return { method: "none", image: null };
}

// ============================================================
//  Public API
// ============================================================

/**
 * Single-URL scrape used by the background enrichment job.
 * Never throws. Returns null → caller keeps image_url pending.
 */
export async function scrapeShopeeImage(productUrl: string): Promise<string | null> {
  try {
    const attempt = await tryPageScrape(productUrl);
    logAttempt(productUrl, attempt);
    return attempt.image;
  } catch (err) {
    logAttempt(productUrl, { method: `error:${(err as Error).message}`, image: null });
    return null;
  }
}

/**
 * Batch resolver with bounded concurrency. Returns a map keyed by itemId.
 * Missing entries → pending (not error).
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
      const image = await scrapeShopeeImage(lookup.productUrl);
      if (image) result.set(lookup.itemId, image);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, unique.length) }, () => worker()),
  );
  return result;
}
