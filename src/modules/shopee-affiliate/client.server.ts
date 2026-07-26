/**
 * Cliente Shopee Affiliate Open API — consulta oficial de oferta de produto.
 *
 * Substitui as tentativas via PDP público (bloqueado por bot-detection
 * `error 90309999`) por chamadas GraphQL assinadas contra
 *   https://open-api.affiliate.shopee.com.br/graphql
 *
 * Este arquivo é ISOLADO (Lote 12E): não é chamado por importação CSV,
 * renderer, cron ou backfill. Só é usado por um endpoint de diagnóstico
 * até validação, e depois plugado no backfill em lote posterior (12F+).
 *
 * NUNCA logar `secret`, `Authorization`, assinatura ou headers.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadShopeeCredentials,
  shopeeGraphqlSigned,
} from "./signature.server";

export type ShopeeProductOffer = {
  itemId: string;
  shopId: string | null;
  productName: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  originalPrice: number | null;
  discountRate: number | null; // % ex: 50 → 50%
  commissionRate: number | null; // % ex: 5.5 → 5.5%
  productLink: string | null;
  offerLink: string | null;
  imageUrl: string | null;
  raw: Record<string, unknown> | null;
};

export type FetchProductOfferResult =
  | { ok: true; offer: ShopeeProductOffer; reason: "success" }
  | {
      ok: false;
      offer: null;
      reason:
        | "invalid_token"
        | "not_found"
        | "api_error"
        | "missing_item_id"
        | "network_error";
      status: number;
      errorCode: string | null;
      errorMessage: string | null;
    };

function log(fields: Record<string, unknown>) {
  try {
    console.log(
      `[SHOPEE_API_PRODUCT_QUERY] ${JSON.stringify({
        ts: new Date().toISOString(),
        ...fields,
      })}`,
    );
  } catch {
    /* ignore */
  }
}

/** Converte campos vindos como string/number para number>0 ou null. */
function toDecimal(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Query GraphQL `productOfferV2` — filtra por `itemId` (e opcionalmente
 * `shopId`). Retorna apenas o primeiro nó (equivalente a "get by id").
 *
 * Campos selecionados (conservador — nomes confirmados na Affiliate Open
 * API v2 BR): itemId, shopId, productName, imageUrl, productLink,
 * offerLink, price, priceMin, priceMax, priceDiscountRate, commissionRate,
 * shopName, sales, ratingStar.
 */
function buildOfferQuery(itemId: string, shopId?: string | null): string {
  const shopArg = shopId ? `,shopId:${shopId}` : "";
  return `query{productOfferV2(itemId:${itemId}${shopArg},limit:1){nodes{itemId shopId productName imageUrl productLink offerLink price priceMin priceMax priceDiscountRate commissionRate shopName sales ratingStar}}}`;
}

/**
 * Busca a oferta oficial de um produto. Não altera nenhum registro:
 * apenas devolve dados normalizados para o chamador decidir persistência.
 */
export async function fetchProductOfferByItem(
  supabase: SupabaseClient,
  userId: string,
  input: { itemId: string | number; shopId?: string | number | null },
): Promise<FetchProductOfferResult> {
  const started = Date.now();
  const itemId = String(input.itemId ?? "").trim();
  const shopId =
    input.shopId != null ? String(input.shopId).trim() || null : null;

  if (!itemId) {
    log({ userId, itemId: null, shopId, status: "missing_item_id" });
    return {
      ok: false,
      offer: null,
      reason: "missing_item_id",
      status: 0,
      errorCode: "missing_item_id",
      errorMessage: null,
    };
  }

  const creds = await loadShopeeCredentials(supabase, userId);
  if (!creds) {
    log({
      userId,
      itemId,
      shopId,
      status: "invalid_token",
      responseTime: Date.now() - started,
    });
    return {
      ok: false,
      offer: null,
      reason: "invalid_token",
      status: 0,
      errorCode: "no_credentials",
      errorMessage: null,
    };
  }

  const result = await shopeeGraphqlSigned<{
    productOfferV2?: { nodes?: any[] };
  }>(creds, buildOfferQuery(itemId, shopId));
  const responseTime = Date.now() - started;

  if (!result.ok) {
    const reason: FetchProductOfferResult["reason"] =
      result.errorCode === "network_error" ? "network_error" : "api_error";
    log({
      userId,
      itemId,
      shopId,
      status: reason,
      responseTime,
      reason: result.errorCode,
    });
    return {
      ok: false,
      offer: null,
      reason,
      status: result.status,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    };
  }

  const node = result.data?.productOfferV2?.nodes?.[0];
  if (!node) {
    log({ userId, itemId, shopId, status: "not_found", responseTime });
    return {
      ok: false,
      offer: null,
      reason: "not_found",
      status: result.status,
      errorCode: "empty_nodes",
      errorMessage: null,
    };
  }

  // Normalização: Shopee Affiliate v2 devolve preços como STRING em reais
  // (ex "29.90") — diferente do PDP público (que devolve em micro-centavos).
  // Convertemos para number decimal sem tocar em escala.
  const price = toDecimal(node.price);
  const priceMin = toDecimal(node.priceMin);
  const priceMax = toDecimal(node.priceMax);
  const discountRate = toDecimal(node.priceDiscountRate);
  const commissionRate = toDecimal(node.commissionRate);

  // A API não retorna diretamente `priceBefore`. `discountRate` é o
  // desconto oficial exibido pela Shopee. NÃO derivamos `originalPrice`
  // aqui — Lote 12F decidirá a política. Mantemos `null` para respeitar
  // "originalPrice somente quando vier da API".
  const offer: ShopeeProductOffer = {
    itemId: String(node.itemId ?? itemId),
    shopId: node.shopId != null ? String(node.shopId) : shopId,
    productName: node.productName ? String(node.productName) : null,
    price,
    priceMin,
    priceMax,
    originalPrice: null,
    discountRate,
    commissionRate,
    productLink: node.productLink ? String(node.productLink) : null,
    offerLink: node.offerLink ? String(node.offerLink) : null,
    imageUrl: node.imageUrl ? String(node.imageUrl) : null,
    raw: node,
  };

  log({ userId, itemId, shopId, status: "success", responseTime });
  return { ok: true, offer, reason: "success" };
}
