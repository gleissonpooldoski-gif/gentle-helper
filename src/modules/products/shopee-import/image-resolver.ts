/**
 * Fetches the main product image from a Shopee product page when the CSV
 * did not include one. Best-effort: failures never block the import.
 */

const FETCH_TIMEOUT_MS = 6_000;
const CONCURRENCY = 6;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function extractItemIds(url: string): { shopId: string; itemId: string } | null {
  // Shopee product URLs commonly end in `-i.SHOPID.ITEMID` or `/product/SHOPID/ITEMID`.
  const iMatch = url.match(/-i\.(\d+)\.(\d+)/);
  if (iMatch) return { shopId: iMatch[1]!, itemId: iMatch[2]! };
  const pMatch = url.match(/\/product\/(\d+)\/(\d+)/);
  if (pMatch) return { shopId: pMatch[1]!, itemId: pMatch[2]! };
  return null;
}

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string | null> {
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
  return `https://down-br.img.susercontent.com/file/${hash}`;
}

async function resolveOne(productUrl: string): Promise<string | null> {
  const ids = extractItemIds(productUrl);
  if (ids) {
    // Public Shopee item API — returns JSON with the image hash.
    const apiUrl = `https://shopee.com.br/api/v4/item/get?itemid=${ids.itemId}&shopid=${ids.shopId}`;
    const json = await fetchText(apiUrl, { "x-requested-with": "XMLHttpRequest" });
    if (json) {
      try {
        const parsed = JSON.parse(json) as { data?: { image?: string; images?: string[] } };
        const hash = parsed.data?.image ?? parsed.data?.images?.[0];
        if (hash) return toShopeeImageUrl(hash);
      } catch {
        // fall through to HTML parsing
      }
    }
  }

  const html = await fetchText(productUrl);
  if (!html) return null;

  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (og?.[1]) return og[1];
  const tw = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  if (tw?.[1]) return tw[1];
  const img = html.match(/<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))["']/i);
  if (img?.[1]) return img[1];
  return null;
}

/**
 * Resolves images for a list of product URLs with bounded concurrency.
 * Returns a map keyed by input URL. Missing entries mean "not found".
 */
export async function resolveImages(urls: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(urls.filter(Boolean)));
  const result = new Map<string, string>();
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < unique.length) {
      const idx = cursor++;
      const url = unique[idx]!;
      try {
        const image = await resolveOne(url);
        if (image) result.set(url, image);
      } catch {
        // swallow: image resolution is best-effort
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, unique.length) }, () => worker());
  await Promise.all(workers);
  return result;
}
