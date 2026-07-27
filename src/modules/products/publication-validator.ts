/**
 * Product Publication Validator — LOTE FINAL
 *
 * Camada única que TODO canal (WhatsApp auto/manual, Instagram Feed/Story,
 * Templates, Preview, Página pública) deve chamar antes de publicar.
 *
 * Não recomputa nada: delega a decisão para `resolveProductDisplay`
 * (a única fonte de verdade) e expõe um contrato estruturado + log de
 * proteção quando dados são removidos por baixa confiabilidade.
 *
 * Regras (já garantidas pelo resolver — validadas aqui):
 *  - Vendas exibidas SOMENTE se `sales_historical > 0` E
 *    `sales_source = 'historical_confirmed'`.
 *  - Comparação DE/POR SOMENTE se `price_quality = HIGH`.
 *  - Nada é inferido a partir de sales_recent/sales/sales_label/Affiliate/CSV.
 */
import {
  resolveProductDisplay,
  type DisplayResolverInput,
  type DisplayResolverResult,
} from "@/modules/products/display-resolver";

export type PublicationChannel =
  | "whatsapp_auto"
  | "whatsapp_manual"
  | "instagram_feed"
  | "instagram_story"
  | "instagram_dm"
  | "template_preview"
  | "public_page";

export interface PublicationValidationInput extends DisplayResolverInput {
  id?: string | null;
}

export interface PublicationValidation {
  /** Ao menos preço "POR" válido para publicar. */
  allowed: boolean;
  /** Pode exibir linha de vendidos. */
  salesApproved: boolean;
  /** Pode exibir comparação DE/POR. */
  discountApproved: boolean;
  /** Motivos das decisões (rastreabilidade). */
  reasons: string[];
  /** Campos suprimidos por falta de confiabilidade. */
  removed: Array<"sales" | "discount">;
  /** Resultado completo do resolver central. */
  display: DisplayResolverResult;
}

export interface ValidateOptions {
  channel: PublicationChannel;
  /** Logger opcional (default: console). */
  log?: (event: string, payload: Record<string, unknown>) => void;
}

function defaultLog(event: string, payload: Record<string, unknown>) {
  try {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event, ...payload }));
  } catch {
    /* noop */
  }
}

export function validateProductForPublication(
  product: PublicationValidationInput,
  opts: ValidateOptions,
): PublicationValidation {
  const display = resolveProductDisplay(product);
  const reasons: string[] = [];
  const removed: PublicationValidation["removed"] = [];

  // Vendas
  const salesApproved =
    display.salesSource === "historical" && (display.salesValue ?? 0) > 0;
  if (salesApproved) {
    reasons.push("Vendas historical_confirmed");
  } else if (
    product.sales != null ||
    product.sales_recent != null ||
    product.sales_label != null ||
    product.sales_historical != null
  ) {
    removed.push("sales");
    reasons.push("Vendas suprimidas: fonte não confirmada");
  }

  // Desconto
  const discountApproved =
    display.priceOriginalDisplay != null &&
    display.priceCurrentDisplay != null &&
    display.priceOriginalDisplay > display.priceCurrentDisplay;
  if (discountApproved) {
    reasons.push(`Preço validado (${display.priceQuality})`);
  } else if (product.original_price != null) {
    removed.push("discount");
    reasons.push(
      `Comparação DE/POR suprimida: price_quality=${display.priceQuality} (${display.priceQualityReason})`,
    );
  }

  // Bloqueio total: sem preço "POR" não há o que publicar.
  const allowed = display.priceCurrentDisplay != null && display.priceQuality !== "BLOCKED";
  if (!allowed) {
    reasons.push(
      display.priceCurrentDisplay == null
        ? "Preço promocional ausente"
        : "Preço original suspeito (BLOCKED)",
    );
  }

  if (removed.length > 0) {
    const logger = opts.log ?? defaultLog;
    logger("PRODUCT_DATA_REMOVED", {
      channel: opts.channel,
      product_id: product.id ?? null,
      removed,
      reason: reasons.join(" | "),
      price_quality: display.priceQuality,
      sales_source: display.salesSource,
    });
  }

  return { allowed, salesApproved, discountApproved, reasons, removed, display };
}
