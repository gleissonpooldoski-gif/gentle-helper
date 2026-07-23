import type { Marketplace } from "../contracts/product.schema";

const HOST_MAP: Array<{ pattern: RegExp; marketplace: Marketplace }> = [
  { pattern: /(^|\.)shopee\.com\.br$/i, marketplace: "shopee" },
  { pattern: /(^|\.)amazon\.com\.br$/i, marketplace: "amazon" },
  { pattern: /(^|\.)amazon\.com$/i, marketplace: "amazon" },
  { pattern: /(^|\.)mercadolivre\.com\.br$/i, marketplace: "mercadolivre" },
  { pattern: /(^|\.)mercadolibre\.com$/i, marketplace: "mercadolivre" },
  { pattern: /(^|\.)magazineluiza\.com\.br$/i, marketplace: "magalu" },
  { pattern: /(^|\.)magalu\.com\.br$/i, marketplace: "magalu" },
  { pattern: /(^|\.)aliexpress\.com$/i, marketplace: "aliexpress" },
];

/** Detecta o marketplace a partir de uma URL. Retorna `null` se não suportado. */
export function detectMarketplace(rawUrl: string): Marketplace | null {
  try {
    const host = new URL(rawUrl).hostname;
    return HOST_MAP.find((h) => h.pattern.test(host))?.marketplace ?? null;
  } catch {
    return null;
  }
}

/** Remove parâmetros de tracking (utm_*, gclid, etc). */
export function stripTracking(rawUrl: string): string {
  const u = new URL(rawUrl);
  const drop = /^(utm_|gclid|fbclid|_ga|mc_|ref|ref_|spm|scm|aff|affid)/i;
  [...u.searchParams.keys()].forEach((k) => drop.test(k) && u.searchParams.delete(k));
  return u.toString();
}
