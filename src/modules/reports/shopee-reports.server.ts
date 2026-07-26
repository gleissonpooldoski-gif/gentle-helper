import { createDecipheriv, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Shopee Affiliate Open API v2 — GraphQL conversionReport.
 *
 * Endpoint oficial BR: https://open-api.affiliate.shopee.com.br/graphql
 * Auth Header: Authorization: SHA256 Credential=<appId>, Timestamp=<ts>, Signature=<sig>
 * Signature = SHA256( appId + timestamp + payload + secret ).hex().lower()
 */

const ENDPOINT = "https://open-api.affiliate.shopee.com.br/graphql";

function encKey(): Buffer {
  const raw = process.env.SHOPEE_CONFIG_ENC_KEY;
  if (!raw) throw new Error("AFFILIATE_ENCRYPTION_UNAVAILABLE");
  return createHash("sha256").update(raw).digest();
}

function decryptApiKey(encoded: string): string {
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const d = createDecipheriv("aes-256-gcm", encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

async function shopeeGraphql(appId: string, secret: string, query: string): Promise<any> {
  const payload = JSON.stringify({ query });
  const ts = Math.floor(Date.now() / 1000);
  const base = `${appId}${ts}${payload}${secret}`;
  const sig = createHash("sha256").update(base).digest("hex");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `SHA256 Credential=${appId}, Timestamp=${ts}, Signature=${sig}`,
    },
    body: payload,
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  if (!res.ok) {
    throw new Error(`Shopee HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  if (json?.errors?.length) {
    const err = json.errors[0];
    const code = err?.extensions?.code ?? err?.code ?? "";
    const msg = err?.message ?? JSON.stringify(err);
    throw new Error(`Shopee API [${code}]: ${msg}`);
  }
  return json;
}

/** Map cru → linha shopee_conversions (idempotente por order_id+item_id) */
function mapNode(userId: string, node: any): {
  user_id: string;
  platform: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  product_image: string | null;
  store_name: string | null;
  category: string | null;
  status: string;
  value: number;
  commission: number;
  commission_pct: number;
  qty: number;
  buyer_type: string;
  device: string;
  order_date: string;
  raw: any;
} {
  const item = node?.items?.[0] ?? node?.item ?? {};
  const purchaseTime = Number(node?.purchaseTime ?? node?.purchase_time ?? 0);
  const orderDate = purchaseTime > 0
    ? new Date(purchaseTime * 1000).toISOString()
    : new Date().toISOString();

  const rawStatus = String(
    node?.purchaseStatus ?? node?.orderStatus ?? node?.status ?? "PENDING",
  ).toUpperCase();
  const status =
    rawStatus.includes("COMPLET") || rawStatus === "PAID"
      ? "COMPLETO"
      : rawStatus.includes("CANCEL")
        ? "CANCELADO"
        : "PENDENTE";

  const value = Number(item?.actualAmount ?? item?.orderAmount ?? item?.itemPrice ?? node?.orderAmount ?? 0);
  const commission = Number(
    item?.orderCommission ?? item?.commission ?? node?.orderCommission ?? node?.totalCommission ?? 0,
  );
  const commissionPct = Number(item?.commissionRate ?? item?.rate ?? 0) * (item?.commissionRate > 1 ? 1 : 100);

  return {
    user_id: userId,
    platform: "shopee",
    order_id: String(node?.orderId ?? node?.purchaseId ?? item?.orderId ?? ""),
    product_id: item?.itemId ? String(item.itemId) : null,
    product_name: String(item?.itemName ?? node?.itemName ?? "Produto Shopee"),
    product_image: item?.imageUrl ?? item?.image ?? null,
    store_name: item?.shopName ?? node?.shopName ?? null,
    category: item?.globalCatName ?? item?.category ?? null,
    status,
    value: Number.isFinite(value) ? value : 0,
    commission: Number.isFinite(commission) ? commission : 0,
    commission_pct: Number.isFinite(commissionPct) ? commissionPct : 0,
    qty: Number(item?.quantity ?? 1),
    buyer_type: String(node?.buyerType ?? "NEW").toUpperCase().includes("NEW") ? "NOVO" : "EXISTENTE",
    device: String(node?.device ?? "UNKNOWN").toUpperCase().includes("MOB") ? "MOBILE" : "DESKTOP",
    order_date: orderDate,
    raw: node,
  };
}

export type SyncResult = { inserted: number; updated: number; pages: number };

export async function syncShopeeConversions(
  supabase: SupabaseClient,
  userId: string,
): Promise<SyncResult> {
  const { data: row, error: rowErr } = await supabase
    .from("affiliate_connections")
    .select("affiliate_id, api_key_encrypted")
    .eq("user_id", userId)
    .eq("platform", "shopee")
    .maybeSingle();
  if (rowErr) throw rowErr;
  const appId = row?.affiliate_id?.trim();
  const enc = row?.api_key_encrypted;
  if (!appId || !enc) throw new Error("Configure App ID e App Secret da Shopee em Config Afiliados.");
  const secret = decryptApiKey(enc);

  // Últimos 30 dias
  const endTs = Math.floor(Date.now() / 1000);
  const startTs = endTs - 60 * 60 * 24 * 30;

  const PAGE_SIZE = 100;
  const MAX_PAGES = 50;
  let scrollId = "";
  let pages = 0;
  let inserted = 0;

  while (pages < MAX_PAGES) {
    const scrollArg = scrollId ? `,scrollId:${JSON.stringify(scrollId)}` : "";
    const query = `query{conversionReport(purchaseTimeStart:${startTs},purchaseTimeEnd:${endTs},limit:${PAGE_SIZE}${scrollArg}){nodes{orderId purchaseTime purchaseStatus buyerType device shopName totalCommission orderAmount items{itemId itemName imageUrl shopName globalCatName itemPrice actualAmount orderCommission commissionRate quantity}} pageInfo{scrollId hasNextPage}}}`;
    const json = await shopeeGraphql(appId, secret, query);
    const report = json?.data?.conversionReport;
    const nodes: any[] = report?.nodes ?? [];
    pages += 1;

    if (nodes.length) {
      const rows = nodes.map((n) => mapNode(userId, n)).filter((r) => r.order_id);
      if (rows.length) {
        const { error: upErr, count } = await supabase
          .from("shopee_conversions")
          .upsert(rows, { onConflict: "user_id,platform,order_id,product_id", count: "exact" });
        if (upErr) throw upErr;
        inserted += count ?? rows.length;
      }
    }

    const nextScroll = report?.pageInfo?.scrollId ?? "";
    const hasNext = Boolean(report?.pageInfo?.hasNextPage);
    if (!hasNext || !nextScroll || nextScroll === scrollId) break;
    scrollId = nextScroll;
  }

  return { inserted, updated: 0, pages };
}
