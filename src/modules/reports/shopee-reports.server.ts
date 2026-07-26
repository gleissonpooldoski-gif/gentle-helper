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

type ConvRow = {
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
};

function mapStatus(orderStatus: string, convStatus: string): string {
  const s = `${orderStatus} ${convStatus}`.toUpperCase();
  if (s.includes("COMPLET") || s.includes("PAID") || s.includes("FULFIL")) return "COMPLETO";
  if (s.includes("CANCEL") || s.includes("RETURN") || s.includes("REFUND")) return "CANCELADO";
  return "PENDENTE";
}

/**
 * Achata conversion → orders → items em linhas.
 * order_id de uma conversion pode conter vários items. Guardamos uma linha por (order, item).
 */
function flattenConversion(userId: string, conv: any): ConvRow[] {
  const purchaseTime = Number(conv?.purchaseTime ?? 0);
  const orderDate = purchaseTime > 0 ? new Date(purchaseTime * 1000).toISOString() : new Date().toISOString();
  const buyer = String(conv?.buyerType ?? "NEW").toUpperCase();
  const device = String(conv?.device ?? "").toUpperCase();
  const convStatus = String(conv?.conversionStatus ?? "");
  const orders: any[] = Array.isArray(conv?.orders) ? conv.orders : [];
  const out: ConvRow[] = [];
  for (const ord of orders) {
    const orderId = String(ord?.orderId ?? conv?.conversionId ?? "");
    const orderStatus = String(ord?.orderStatus ?? "");
    const items: any[] = Array.isArray(ord?.items) ? ord.items : [];
    if (items.length === 0) continue;
    for (const item of items) {
      const value = Number(item?.actualAmount ?? item?.itemPrice ?? 0);
      const commission = Number(item?.itemTotalCommission ?? item?.itemCommission ?? 0);
      const rate = Number(item?.itemSellerCommissionRate ?? 0);
      out.push({
        user_id: userId,
        platform: "shopee",
        order_id: orderId,
        product_id: item?.itemId ? String(item.itemId) : null,
        product_name: String(item?.itemName ?? "Produto Shopee"),
        product_image: item?.imageUrl || null,
        store_name: item?.shopName || null,
        category: item?.globalCategoryLv1Name || item?.categoryLv1Name || null,
        status: mapStatus(orderStatus, convStatus),
        value: Number.isFinite(value) ? value : 0,
        commission: Number.isFinite(commission) ? commission : 0,
        commission_pct: Number.isFinite(rate) ? (rate > 1 ? rate : rate * 100) : 0,
        qty: Number(item?.qty ?? 1),
        buyer_type: buyer.includes("NEW") ? "NOVO" : "EXISTENTE",
        device: device.includes("MOB") || device.includes("APP") ? "MOBILE" : "DESKTOP",
        order_date: orderDate,
        raw: { conv, ord, item },
      });
    }
  }
  return out;
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

  const endTs = Math.floor(Date.now() / 1000);
  const startTs = endTs - 60 * 60 * 24 * 30;

  const PAGE_SIZE = 100;
  const MAX_PAGES = 50;
  let scrollId = "";
  let pages = 0;
  let inserted = 0;

  while (pages < MAX_PAGES) {
    const scrollArg = scrollId ? `,scrollId:${JSON.stringify(scrollId)}` : "";
    const query = `query{conversionReport(purchaseTimeStart:${startTs},purchaseTimeEnd:${endTs},limit:${PAGE_SIZE}${scrollArg}){nodes{conversionId purchaseTime conversionStatus buyerType device totalCommission orders{orderId orderStatus items{itemId itemName itemPrice actualAmount qty imageUrl shopName itemCommission itemTotalCommission itemSellerCommissionRate categoryLv1Name globalCategoryLv1Name}}} pageInfo{scrollId hasNextPage}}}`;
    const json = await shopeeGraphql(appId, secret, query);
    const report = json?.data?.conversionReport;
    const nodes: any[] = report?.nodes ?? [];
    pages += 1;

    const rows: ConvRow[] = [];
    for (const n of nodes) rows.push(...flattenConversion(userId, n));
    const dedup = new Map<string, ConvRow>();
    for (const r of rows) {
      if (!r.order_id || !r.product_id) continue;
      const k = `${r.order_id}|${r.product_id}`;
      const prev = dedup.get(k);
      if (!prev) { dedup.set(k, r); continue; }
      // Merge quantidades e valores para o mesmo (order, item)
      prev.qty += r.qty;
      prev.value += r.value;
      prev.commission += r.commission;
      prev.raw = { merged: true, items: [prev.raw, r.raw] };
    }
    const clean = [...dedup.values()];
    if (clean.length) {
      const { error: upErr, count } = await supabase
        .from("shopee_conversions")
        .upsert(clean, { onConflict: "user_id,platform,order_id,product_id", count: "exact" });
      if (upErr) throw upErr;
      inserted += count ?? clean.length;
    }


    const nextScroll = report?.pageInfo?.scrollId ?? "";
    const hasNext = Boolean(report?.pageInfo?.hasNextPage);
    if (!hasNext || !nextScroll || nextScroll === scrollId) break;
    scrollId = nextScroll;
  }

  return { inserted, updated: 0, pages };
}

