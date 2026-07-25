/**
 * Helpers para servir imagens de produto de forma rápida.
 * - Shopee CDN aceita o sufixo `_tn` no path `/file/<hash>` retornando
 *   uma miniatura ~10x menor (perfeita para grids/thumbnails).
 * - Para o preview em tela cheia usamos a URL original.
 */

const SHOPEE_CDN_RE =
  /^(https?:\/\/(?:[a-z0-9-]+\.)*(?:susercontent\.com|cf\.shopee\.[a-z.]+|shopeemobile\.com)\/file\/[a-z0-9-]+)(_tn)?(\?.*)?$/i;

export function toThumbUrl(url: string | null | undefined): string {
  if (!url) return "";
  const m = url.match(SHOPEE_CDN_RE);
  if (!m) return url;
  const base = m[1];
  const query = m[3] ?? "";
  return `${base}_tn${query}`;
}
