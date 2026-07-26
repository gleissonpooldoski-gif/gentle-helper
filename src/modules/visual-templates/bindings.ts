// Placeholder + real value resolution for smart elements.
import { formatSalesLabel } from "@/modules/products/sales-label";

export function formatBRL(v: number | string | null | undefined) {
  const n = typeof v === "string" ? Number(v) : v;
  if (n == null || !Number.isFinite(n)) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Fonte única (LOTE 16F): só emite rótulo quando existe sales_historical
 * E sales_source = 'historical_confirmed'. Nunca usa sales_recent, sales
 * legacy ou sales_label como prova social.
 */
export function humanizeSales(
  salesHistorical?: number | null,
  salesSource?: string | null,
) {
  const confirmed = String(salesSource ?? "").toLowerCase() === "historical_confirmed";
  if (!confirmed) return "";
  const label = formatSalesLabel(salesHistorical ?? null);
  return label ? `${label} vendidos` : "";
}

export interface ProductLite {
  id: string;
  title: string | null;
  image_url: string | null;
  original_price: number | null;
  promo_price: number | null;
  sales: number | null;
  sales_label: string | null;
  sales_historical?: number | null;
  sales_source?: string | null;
  store_name: string | null;
}

export interface ResolvedProduct {
  title: string;
  image_url: string;
  original: string;
  price: string;
  discount: string;
  sold: string;
  store: string;
  hasOriginal: boolean;
}

export function resolveProduct(p?: ProductLite | null): ResolvedProduct {
  const price = formatBRL(p?.promo_price ?? p?.original_price ?? 0);
  const hasOriginal =
    !!p?.original_price && !!p?.promo_price && Number(p.original_price) > Number(p.promo_price);
  const original = hasOriginal ? formatBRL(p!.original_price) : "";
  const disc =
    hasOriginal && p?.original_price && p?.promo_price
      ? Math.round((1 - Number(p.promo_price) / Number(p.original_price)) * 100)
      : 0;
  return {
    title: p?.title?.trim() || "Título do produto",
    image_url: p?.image_url || "",
    original,
    price,
    discount: disc > 0 ? `-${disc}%` : "",
    sold: humanizeSales(p?.sales_historical ?? null, p?.sales_source ?? null),
    store: p?.store_name || "",
    hasOriginal,
  };
}

// Sample used when no product is selected inside the editor.
export const SAMPLE: ResolvedProduct = {
  title: "Nome do Produto de Exemplo Bem Longo",
  image_url: "",
  original: "R$ 99,90",
  price: "R$ 49,90",
  discount: "-50%",
  sold: "5 mil+ vendidos",
  store: "Loja Exemplo",
  hasOriginal: true,
};
