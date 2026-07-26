/**
 * Helpers compartilhados do Shopee Affiliate Open API.
 *
 * Centraliza:
 *   - Decriptação AES-256-GCM da `api_key_encrypted` de `affiliate_connections`.
 *   - Assinatura oficial e chamada GraphQL contra
 *     https://open-api.affiliate.shopee.com.br/graphql
 *
 * NUNCA logar `secret`, `Authorization`, `payload` bruto ou headers.
 *
 * ATENÇÃO: código server-only (usa `node:crypto`); não importar do bundle
 * do cliente. Duplicado historicamente em `shopee-shortlink.server.ts` e
 * `shopee-reports.server.ts` — este arquivo é a fonte canônica futura.
 */
import { createDecipheriv, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const SHOPEE_AFFILIATE_ENDPOINT =
  "https://open-api.affiliate.shopee.com.br/graphql";

function encKey(): Buffer {
  const raw = process.env.SHOPEE_CONFIG_ENC_KEY;
  if (!raw) throw new Error("AFFILIATE_ENCRYPTION_UNAVAILABLE");
  return createHash("sha256").update(raw).digest();
}

export function decryptShopeeSecret(encoded: string): string {
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const d = createDecipheriv("aes-256-gcm", encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

export type ShopeeCredentials = { appId: string; secret: string };

/**
 * Lê `affiliate_connections` (platform=shopee) e devolve appId + secret
 * decriptado. Retorna null quando ausente — chamador decide skip/error.
 */
export async function loadShopeeCredentials(
  supabase: SupabaseClient,
  userId: string,
): Promise<ShopeeCredentials | null> {
  const { data, error } = await supabase
    .from("affiliate_connections")
    .select("affiliate_id, api_key_encrypted")
    .eq("user_id", userId)
    .eq("platform", "shopee")
    .maybeSingle();
  if (error) throw error;
  const appId = data?.affiliate_id?.trim();
  const enc = data?.api_key_encrypted;
  if (!appId || !enc) return null;
  try {
    const secret = decryptShopeeSecret(enc);
    return secret ? { appId, secret } : null;
  } catch {
    return null;
  }
}

export type ShopeeGraphqlResult<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | null;
  errorCode: string | null;
  errorMessage: string | null;
};

/**
 * Executa uma query GraphQL assinada. Não faz throw — devolve resultado
 * discriminado para o chamador logar/classificar sem vazar credenciais.
 */
export async function shopeeGraphqlSigned<T = any>(
  creds: ShopeeCredentials,
  query: string,
  timeoutMs = 15_000,
): Promise<ShopeeGraphqlResult<T>> {
  const payload = JSON.stringify({ query });
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHash("sha256")
    .update(`${creds.appId}${ts}${payload}${creds.secret}`)
    .digest("hex");

  let res: Response;
  try {
    res = await fetch(SHOPEE_AFFILIATE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `SHA256 Credential=${creds.appId}, Timestamp=${ts}, Signature=${sig}`,
      },
      body: payload,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      errorCode: "network_error",
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      data: null,
      errorCode: `http_${res.status}`,
      errorMessage: text.slice(0, 300),
    };
  }
  if (json?.errors?.length) {
    const err = json.errors[0];
    return {
      ok: false,
      status: res.status,
      data: null,
      errorCode: String(err?.extensions?.code ?? err?.code ?? "graphql_error"),
      errorMessage: String(err?.message ?? JSON.stringify(err)).slice(0, 300),
    };
  }
  return {
    ok: true,
    status: res.status,
    data: (json?.data ?? null) as T | null,
    errorCode: null,
    errorMessage: null,
  };
}
