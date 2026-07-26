/**
 * Product Display Resolver — camada ÚNICA de decisão do que exibir em posts.
 *
 * Escopo: vendas exibidas, preço original exibido, sufixo de vendas.
 * Consumidores: WhatsApp (automation-tick, preview) e Instagram.
 *
 * Regras chave:
 *  - Vendas: prioridade sales_historical → sales_recent (com sufixo "recentemente")
 *    → sales (compatibilidade). Nunca multiplica, arredonda ou inventa.
 *  - Preço: delega para classifyShopeePriceQuality; só mostra "DE/POR" quando HIGH.
 *  - Non-Shopee: preserva comportamento atual (mostra original_price se maior que promo).
 */
import { formatSalesLabel } from "@/modules/products/sales-label";
import {
  classifyShopeePriceQuality,
  type PriceQuality,
} from "@/modules/shopee-affiliate/price-quality";

export interface DisplayResolverInput {
  title?: string | null;
  platform?: string | null;
  promo_price?: number | string | null;
  original_price?: number | string | null;
  // Novos campos (Fase 1)
  sales_recent?: number | string | null;
  sales_historical?: number | string | null;
  sales_source?: string | null;
  // Legado (compat)
  sales?: number | string | null;
  sales_label?: string | null;
  // Persistidos (Fase 3)
  price_quality?: PriceQuality | string | null;
}

export interface DisplayResolverResult {
  /** Rótulo pronto para exibição (ex: "5 mil vendidos", "500 vendidos recentemente"). Vazio => omitir linha. */
  salesLabel: string;
  /** Valor numérico usado. */
  salesValue: number | null;
  /** "historical" | "recent" | "legacy" | null */
  salesSource: "historical" | "recent" | "legacy" | null;
  /** true quando o dado é apenas da janela recente (frase "recentemente"). */
  salesIsRecentOnly: boolean;

  /** Preço original efetivo para exibir "DE" (null => suprimir). */
  priceOriginalDisplay: number | null;
  /** Preço promocional efetivo ("POR"). */
  priceCurrentDisplay: number | null;
  /** Classificação (só relevante para Shopee). */
  priceQuality: PriceQuality;
  priceQualityReason: string;
  /** Percentual de desconto para exibição, apenas quando priceOriginalDisplay != null. */
  discountPct: number | null;
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n =
    typeof v === "number"
      ? v
      : Number(String(v).replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toInt(v: unknown): number | null {
  const n = toNum(v);
  return n == null ? null : Math.floor(n);
}

export function resolveProductDisplay(p: DisplayResolverInput): DisplayResolverResult {
  const platform = (p.platform ?? "").toLowerCase();
  const isShopee = platform === "shopee";

  // ---------- VENDAS (LOTE 16: apenas sales_historical) ----------
  // Regra comercial: só exibir "X vendidos" quando existir contador
  // histórico real do anúncio. Nunca usar sales_recent, sales legacy
  // ou dados da Affiliate API como prova social.
  const hist = toInt(p.sales_historical);
  let salesValue: number | null = null;
  let salesSource: DisplayResolverResult["salesSource"] = null;
  const salesIsRecentOnly = false;

  if (hist != null) {
    salesValue = hist;
    salesSource = "historical";
  }

  const base = formatSalesLabel(salesValue);
  const salesLabel = base ? `${base} vendidos` : "";

  // ---------- PREÇO ----------
  let priceQuality: PriceQuality = "HIGH";
  let priceQualityReason = "ok";
  let priceOriginalDisplay: number | null = null;
  const promoNum = toNum(p.promo_price);
  const originalNum = toNum(p.original_price);

  if (isShopee) {
    // Prioriza classificação persistida (Fase 3). Se ausente, calcula em runtime.
    const persisted = String(p.price_quality ?? "").toUpperCase();
    if (persisted === "HIGH" || persisted === "MEDIUM" || persisted === "LOW" || persisted === "BLOCKED") {
      priceQuality = persisted as PriceQuality;
      priceQualityReason = "persisted";
      if (priceQuality === "HIGH" && originalNum != null && promoNum != null && originalNum > promoNum) {
        priceOriginalDisplay = originalNum;
      }
    } else {
      const q = classifyShopeePriceQuality({
        title: p.title,
        promo_price: p.promo_price,
        original_price: p.original_price,
      });
      priceQuality = q.quality;
      priceQualityReason = q.reason;
      priceOriginalDisplay = q.showComparison ? q.effectiveOriginal : null;
    }
  } else {
    // Non-Shopee: preserva comportamento atual — mostra original se > promo.
    if (originalNum != null && promoNum != null && originalNum > promoNum) {
      priceOriginalDisplay = originalNum;
    }
  }

  const discountPct =
    priceOriginalDisplay != null && promoNum != null && priceOriginalDisplay > promoNum
      ? Math.round(((priceOriginalDisplay - promoNum) / priceOriginalDisplay) * 100)
      : null;

  return {
    salesLabel,
    salesValue,
    salesSource,
    salesIsRecentOnly,
    priceOriginalDisplay,
    priceCurrentDisplay: promoNum,
    priceQuality,
    priceQualityReason,
    discountPct,
  };
}
