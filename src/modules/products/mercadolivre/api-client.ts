/**
 * Mercado Livre public API client + link parser.
 * All calls are best-effort and return null / empty on failure — the caller
 * decides how to surface errors.
 */

const FETCH_TIMEOUT_MS = 8_000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export type MLItem = {
  id: string;            // MLBxxxxx
  title: string;
  price: number | null;
  originalPrice: number | null;
  discount: number | null;
  currency: string | null;
  permalink: string;
  thumbnail: string | null;
  pictures: string[];
  categoryId: string | null;
  sellerId: number | null;
  sold: number | null;
};

export class MLApiError extends Error {
  constructor(message: string, public url: string, public status?: number) {
    super(message);
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept: "application/json" },
    });
    console.log("[ML][api]", { url, status: res.status });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new MLApiError(
        `ML API ${res.status}: ${body.slice(0, 200) || res.statusText}`,
        url,
        res.status,
      );
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof MLApiError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new MLApiError(`Falha de rede ao chamar ML: ${msg}`, url);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract an MLB id from any Mercado Livre URL / plain string.
 * Handles: MLB-1234567890, MLB1234567890, produto.mercadolivre.com.br/MLB-...,
 * mercadolivre.com.br/... -i.MLB..., and pure input like "MLB1234567890".
 * Short links (mercadolivre.com/sec/...) are resolved via `resolveShortLink`.
 */
export function parseMLBId(input: string): string | null {
  if (!input) return null;
  const s = input.trim();

  // Direct match anywhere in the string, with optional dash.
  const m = s.match(/MLB-?\s*([0-9]{6,15})/i);
  if (m) return `MLB${m[1]}`;

  return null;
}

/**
 * Follow redirects for short/affiliate links and try to re-extract the MLB id
 * from the final URL. Returns null when nothing usable can be resolved.
 */
export async function resolveShortLink(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": UA },
    });
    const finalUrl = res.url ?? url;
    return finalUrl;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type RawItem = {
  id?: string;
  title?: string;
  price?: number;
  original_price?: number | null;
  currency_id?: string;
  permalink?: string;
  thumbnail?: string;
  secure_thumbnail?: string;
  pictures?: Array<{ url?: string; secure_url?: string }>;
  category_id?: string;
  seller_id?: number;
  seller?: { id?: number };
  sold_quantity?: number;
};

function normalize(raw: RawItem): MLItem | null {
  if (!raw.id || !raw.title || !raw.permalink) return null;
  const price = typeof raw.price === "number" ? raw.price : null;
  const original =
    typeof raw.original_price === "number" && raw.original_price > 0
      ? raw.original_price
      : null;
  const discount =
    original && price && original > price
      ? Math.round(((original - price) / original) * 100)
      : null;
  const pictures = (raw.pictures ?? [])
    .map((p) => p.secure_url ?? p.url ?? "")
    .filter((u): u is string => !!u);
  const thumbnail = raw.secure_thumbnail ?? raw.thumbnail ?? pictures[0] ?? null;
  return {
    id: raw.id,
    title: raw.title,
    price,
    originalPrice: original,
    discount,
    currency: raw.currency_id ?? null,
    permalink: raw.permalink,
    thumbnail,
    pictures,
    categoryId: raw.category_id ?? null,
    sellerId: raw.seller_id ?? raw.seller?.id ?? null,
    sold: typeof raw.sold_quantity === "number" ? raw.sold_quantity : null,
  };
}

export async function getItemById(mlbId: string): Promise<MLItem | null> {
  const raw = await fetchJson<RawItem>(
    `https://api.mercadolibre.com/items/${encodeURIComponent(mlbId)}`,
  );
  if (!raw) return null;
  return normalize(raw);
}

type SearchResult = {
  results?: RawItem[];
  paging?: { total?: number; offset?: number; limit?: number };
};

export type SearchOptions = {
  query?: string;
  categoryId?: string;
  offset?: number;
  limit?: number; // ML caps at 50 per page
  sort?: "relevance" | "price_asc" | "price_desc";
};

export async function searchItems(opts: SearchOptions): Promise<{
  items: MLItem[];
  total: number;
  offset: number;
  limit: number;
}> {
  const params = new URLSearchParams();
  if (opts.query) params.set("q", opts.query);
  if (opts.categoryId) params.set("category", opts.categoryId);
  params.set("offset", String(opts.offset ?? 0));
  params.set("limit", String(Math.min(opts.limit ?? 24, 50)));
  if (opts.sort === "price_asc") params.set("sort", "price_asc");
  if (opts.sort === "price_desc") params.set("sort", "price_desc");

  const url = `https://api.mercadolibre.com/sites/MLB/search?${params.toString()}`;
  const raw = await fetchJson<SearchResult>(url);
  if (!raw) return { items: [], total: 0, offset: opts.offset ?? 0, limit: opts.limit ?? 24 };
  const items = (raw.results ?? [])
    .map(normalize)
    .filter((i): i is MLItem => !!i);
  return {
    items,
    total: raw.paging?.total ?? items.length,
    offset: raw.paging?.offset ?? opts.offset ?? 0,
    limit: raw.paging?.limit ?? opts.limit ?? 24,
  };
}

/**
 * Highlights / current deals feed from ML BR.
 */
export async function getHighlights(offset = 0, limit = 24): Promise<{
  items: MLItem[];
  total: number;
  offset: number;
  limit: number;
}> {
  // ML "deals" endpoint returns product ids; use search with sort as a
  // reliable fallback surface for "ofertas" tab.
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(Math.min(limit, 50)),
    sort: "relevance",
    // Bias to items showing discount.
    discount: "5-100",
  });
  const raw = await fetchJson<SearchResult>(
    `https://api.mercadolibre.com/sites/MLB/search?${params.toString()}`,
  );
  if (!raw) return { items: [], total: 0, offset, limit };
  const items = (raw.results ?? [])
    .map(normalize)
    .filter((i): i is MLItem => !!i);
  return {
    items,
    total: raw.paging?.total ?? items.length,
    offset: raw.paging?.offset ?? offset,
    limit: raw.paging?.limit ?? limit,
  };
}

/**
 * Build the affiliate URL for a product, gracefully falling back to the
 * original URL when the user has no ML connection configured.
 * `tag` is the user's Mercado Livre affiliate tag (may be null).
 */
export function buildAffiliateUrl(permalink: string, tag: string | null): string {
  if (!tag) return permalink;
  try {
    const u = new URL(permalink);
    u.searchParams.set("matt_word", tag);
    u.searchParams.set("matt_tool", tag);
    return u.toString();
  } catch {
    const sep = permalink.includes("?") ? "&" : "?";
    return `${permalink}${sep}matt_word=${encodeURIComponent(tag)}`;
  }
}
