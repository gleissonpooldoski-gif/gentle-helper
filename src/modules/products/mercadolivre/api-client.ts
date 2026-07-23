/**
 * Mercado Livre API client.
 * All authenticated calls require an OAuth access_token loaded server-side
 * from `mercadolivre_integrations` (see modules/affiliate/mercado-livre/oauth.server).
 * The token is passed into each function — this module never reads it directly.
 */

const FETCH_TIMEOUT_MS = 10_000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export type MLItem = {
  id: string;
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

async function fetchJson<T>(url: string, accessToken?: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const headers: Record<string, string> = {
    "user-agent": UA,
    accept: "application/json",
  };
  if (accessToken) headers["authorization"] = `Bearer ${accessToken}`;

  console.log("[ML][api] request", {
    url,
    hasToken: !!accessToken,
  });

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers,
    });
    const bodyText = await res.text().catch(() => "");
    console.log("[ML][api] response", {
      url,
      status: res.status,
      body: bodyText.slice(0, 400),
    });
    if (!res.ok) {
      let friendly = `Mercado Livre API ${res.status}`;
      if (res.status === 401) {
        friendly = "Token Mercado Livre expirado. Reconecte a integração.";
      } else if (res.status === 403) {
        friendly = accessToken
          ? "Acesso negado pelo Mercado Livre (403). Verifique escopos do app."
          : "Endpoint bloqueado (403). Conecte sua conta Mercado Livre.";
      } else if (res.status === 404) {
        friendly = "Recurso não encontrado no Mercado Livre.";
      } else if (res.status === 429) {
        friendly = "Mercado Livre limitou as requisições (429). Aguarde alguns instantes.";
      } else if (res.status >= 500) {
        friendly = `Mercado Livre indisponível (${res.status}).`;
      }
      throw new MLApiError(friendly, url, res.status);
    }
    return JSON.parse(bodyText) as T;
  } catch (err) {
    if (err instanceof MLApiError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new MLApiError(`Falha de rede ao chamar Mercado Livre: ${msg}`, url);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract an MLB id from any Mercado Livre URL / plain string.
 */
export function parseMLBId(input: string): string | null {
  if (!input) return null;
  const s = input.trim();
  const m = s.match(/MLB-?\s*([0-9]{6,15})/i);
  if (m) return `MLB${m[1]}`;
  if (/^[0-9]{8,15}$/.test(s)) return `MLB${s}`;
  return null;
}

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
    return res.url ?? url;
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
    typeof raw.original_price === "number" && raw.original_price > 0 ? raw.original_price : null;
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

export async function getItemById(mlbId: string, accessToken?: string): Promise<MLItem | null> {
  const url = `https://api.mercadolibre.com/items/${encodeURIComponent(mlbId)}`;
  try {
    const raw = await fetchJson<RawItem>(url, accessToken);
    return normalize(raw);
  } catch (err) {
    if (err instanceof MLApiError && err.status === 404) return null;
    throw err;
  }
}

type SearchResult = {
  results?: RawItem[];
  paging?: { total?: number; offset?: number; limit?: number };
};

export type SearchOptions = {
  query?: string;
  categoryId?: string;
  offset?: number;
  limit?: number;
  sort?: "relevance" | "price_asc" | "price_desc";
};

export async function searchItems(
  opts: SearchOptions,
  accessToken: string,
): Promise<{ items: MLItem[]; total: number; offset: number; limit: number }> {
  const params = new URLSearchParams();
  if (opts.query) params.set("q", opts.query);
  if (opts.categoryId) params.set("category", opts.categoryId);
  params.set("offset", String(opts.offset ?? 0));
  params.set("limit", String(Math.min(opts.limit ?? 24, 50)));
  if (opts.sort === "price_asc") params.set("sort", "price_asc");
  if (opts.sort === "price_desc") params.set("sort", "price_desc");

  const url = `https://api.mercadolibre.com/sites/MLB/search?${params.toString()}`;
  const raw = await fetchJson<SearchResult>(url, accessToken);
  const items = (raw.results ?? []).map(normalize).filter((i): i is MLItem => !!i);
  return {
    items,
    total: raw.paging?.total ?? items.length,
    offset: raw.paging?.offset ?? opts.offset ?? 0,
    limit: raw.paging?.limit ?? opts.limit ?? 24,
  };
}

export async function getHighlights(
  offset = 0,
  limit = 24,
  accessToken?: string,
): Promise<{ items: MLItem[]; total: number; offset: number; limit: number }> {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(Math.min(limit, 50)),
    sort: "relevance",
    discount: "5-100",
  });
  const url = `https://api.mercadolibre.com/sites/MLB/search?${params.toString()}`;
  const raw = await fetchJson<SearchResult>(url, accessToken);
  const items = (raw.results ?? []).map(normalize).filter((i): i is MLItem => !!i);
  return {
    items,
    total: raw.paging?.total ?? items.length,
    offset: raw.paging?.offset ?? offset,
    limit: raw.paging?.limit ?? limit,
  };
}

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
