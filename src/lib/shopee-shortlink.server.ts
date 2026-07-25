import { createDecipheriv, createHash, createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

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

/**
 * Chama a Shopee Affiliate Open API (GraphQL) para gerar um shortLink oficial
 * assinado com HMAC-SHA256. Retorna null em qualquer falha (o chamador aplica
 * fallback com af_id).
 *
 * Endpoint: https://open-api.affiliate.shopee.com.br/graphql
 * Header: Authorization: SHA256 Credential=<appId>, Timestamp=<ts>, Signature=<sig>
 * sig = HMAC_SHA256(secret, `${appId}${ts}${payload}${secret}`)  (formato Shopee)
 * Docs: partner center → Open API v2
 */
export async function generateShopeeShortLinkSigned(
  supabase: SupabaseClient,
  userId: string,
  originalUrl: string,
  subIds: string[] = [],
): Promise<string | null> {
  const { data: row } = await supabase
    .from("affiliate_connections")
    .select("affiliate_id, api_key_encrypted")
    .eq("user_id", userId)
    .eq("platform", "shopee")
    .maybeSingle();
  const appId = row?.affiliate_id?.trim();
  const enc = row?.api_key_encrypted;
  if (!appId || !enc) return null;

  let secret: string;
  try {
    secret = decryptApiKey(enc);
  } catch {
    return null;
  }
  if (!secret) return null;

  const query = `mutation{generateShortLink(input:{originUrl:"${originalUrl.replace(/"/g, '\\"')}"${
    subIds.length ? `,subIds:${JSON.stringify(subIds)}` : ""
  }}){shortLink}}`;
  const payload = JSON.stringify({ query });
  const ts = Math.floor(Date.now() / 1000);
  const base = `${appId}${ts}${payload}${secret}`;
  const sig = createHmac("sha256", secret).update(base).digest("hex");
  // Fallback comum em algumas versões: SHA256 direto (sem HMAC).
  const sigPlain = createHash("sha256").update(base).digest("hex");

  const endpoints = [
    "https://open-api.affiliate.shopee.com.br/graphql",
    "https://open-api.affiliate.shopee.com/graphql",
  ];
  for (const url of endpoints) {
    for (const sigVariant of [sig, sigPlain]) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `SHA256 Credential=${appId}, Timestamp=${ts}, Signature=${sigVariant}`,
          },
          body: payload,
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;
        const json = (await res.json()) as {
          data?: { generateShortLink?: { shortLink?: string } };
          errors?: unknown;
        };
        const link = json?.data?.generateShortLink?.shortLink;
        if (link && /^https?:\/\//i.test(link)) return link;
      } catch {
        /* tenta próximo */
      }
    }
  }
  return null;
}
