/**
 * Fetches the main product image for Shopee products imported via CSV.
 * Priority:
 *   1. Shopee public item API using Item Id (+ shop id parsed from Product Link)
 *   2. og:image / twitter:image scraped from the Product Link
 * Best-effort: any failure returns null and the import continues.
 */

const FETCH_TIMEOUT_MS = 7_000;
const CONCURRENCY = 6;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

export type ImageLookup = { itemId: string; productUrl: string };

function extractShopId(url: string): string | null {
  const iMatch = url.match(/-i\.(\d+)\.(\d+)/);
  if (iMatch) return iMatch[1]!;
  const pMatch = url.match(/\/product\/(\d+)\/(\d+)/);
  if (pMatch) return pMatch[1]!;
  return null;
}

async function fetchText(
  url: string,
  headers: Record<string, string> = {},
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": UA,
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.6",
        accept: "text/html,application/xhtml+xml,application/json,*/*;q=0.8",
        ...headers,
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function toShopeeImageUrl(hash: string): string {
  if (/^https?:\/\//i.test(hash)) return hash;
  // Official Shopee BR CDN pattern.
  return `https://cf.shopee.com.br/file/${hash}`;
}

async function tryShopeeApi(itemId: string, shopId: string): Promise<string | null> {
  const endpoints = [
    `https://shopee.com.br/api/v4/item/get?itemid=${itemId}&shopid=${shopId}`,
    `https://shopee.com.br/api/v2/item/get?itemid=${itemId}&shopid=${shopId}`,
  ];
  for (const url of endpoints) {
    const json = await fetchText(url, {
      "x-requested-with": "XMLHttpRequest",
      referer: "https://shopee.com.br/",
      accept: "application/json",
    });
    if (!json) continue;
    try {
      const parsed = JSON.parse(json) as {
        data?: {
          image?: string;
          images?: string[];
          item?: { image?: string; images?: string[] };
        };
        item?: { image?: string; images?: string[] };
      };
      const node = parsed.data?.item ?? parsed.data ?? parsed.item;
      // Prefer full images[] list; first entry = main image. Fall back to `image`.
      const hash =
        (node?.images && node.images.length > 0 ? node.images[0] : undefined) ??
        node?.image;
      if (hash) return toShopeeImageUrl(hash);
    } catch {
      /* try next */
    }
  }
  return null;
}

const SHOPEE_CDN_RE =
  /https?:\/\/(?:cf\.shopee\.com\.br|down-[a-z0-9-]+\.img\.susercontent\.com|cf\.shopee\.[a-z.]+)\/file\/[a-z0-9_-]+(?:_tn)?/i;

function findShopeeCdnUrl(html: string): string | null {
  const direct = html.match(SHOPEE_CDN_RE);
  if (direct?.[0]) return direct[0];
  const jsonHash =
    html.match(/"image"\s*:\s*"([a-f0-9]{20,})"/i) ??
    html.match(/"images"\s*:\s*\[\s*"([a-f0-9]{20,})"/i);
  if (jsonHash?.[1]) return toShopeeImageUrl(jsonHash[1]);
  return null;
}

async function tryPageScrape(productUrl: string): Promise<string | null> {
  const html =
    (await fetchText(productUrl)) ??
    (await fetchText(productUrl, { "user-agent": MOBILE_UA }));
  if (!html) return null;

  // 1. Real Shopee CDN URL embedded in page/JSON
  const cdn = findShopeeCdnUrl(html);
  if (cdn) return cdn;

  // 2. Open Graph fallback
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (og?.[1]) return og[1];
  const ogAlt = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogAlt?.[1]) return ogAlt[1];
  const tw = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  if (tw?.[1]) return tw[1];
  const linkImg = html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i);
  if (linkImg?.[1]) return linkImg[1];
  return null;
}

async function resolveOne(input: ImageLookup): Promise<string | null> {
  // Affiliate API doesn't expose product images — only scrape the product page.
  return tryPageScrape(input.productUrl);
}

/**
 * Resolves images for the given lookups with bounded concurrency.
 * Returns a map keyed by `itemId`. Missing entries mean "not found".
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

  async function worker(): Promise<void> {
    while (cursor < unique.length) {
      const idx = cursor++;
      const lookup = unique[idx]!;
      try {
        const image = await resolveOne(lookup);
        if (image) result.set(lookup.itemId, image);
      } catch {
        /* best-effort */
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, unique.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return result;
}
