/**
 * Server-only helpers for Mercado Livre OAuth.
 * - Signs/verifies the state parameter (HMAC)
 * - Exchanges auth codes for tokens
 * - Refreshes expired tokens
 * - Stores tokens encrypted in `mercadolivre_integrations`
 * - Loads a valid access_token for API calls (auto-refresh)
 *
 * Never import this file from a client bundle.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { encryptSecret, decryptSecret } from "@/modules/affiliate/crypto.server";

const AUTH_URL = "https://auth.mercadolivre.com.br/authorization";
const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";
const STATE_TTL_SECONDS = 15 * 60;

function stateSecret(): string {
  const s = process.env.SHOPEE_CONFIG_ENC_KEY;
  if (!s) throw new Error("SHOPEE_CONFIG_ENC_KEY não configurado.");
  return s;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

/** Sign state as `<payload_b64>.<hmac_b64>` where payload = {u, e}. */
export function signState(userId: string): string {
  const payload = JSON.stringify({ u: userId, e: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS });
  const p = b64url(payload);
  const sig = b64url(createHmac("sha256", stateSecret()).update(p).digest());
  return `${p}.${sig}`;
}

export function verifyState(state: string): { userId: string } | null {
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [p, sig] = parts;
  const expected = b64url(createHmac("sha256", stateSecret()).update(p).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as { u: string; e: number };
    if (!decoded.u || !decoded.e) return null;
    if (Date.now() / 1000 > decoded.e) return null;
    return { userId: decoded.u };
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl(redirectUri: string, state: string): string {
  const clientId = process.env.ML_CLIENT_ID;
  if (!clientId) throw new Error("ML_CLIENT_ID não configurado no backend.");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  user_id: number;
  refresh_token: string;
};

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try {
      const j = JSON.parse(text) as { message?: string; error?: string };
      msg = j.message ?? j.error ?? msg;
    } catch { /* keep raw */ }
    throw new Error(`Mercado Livre OAuth ${res.status}: ${msg}`);
  }
  return JSON.parse(text) as TokenResponse;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const clientId = process.env.ML_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("ML_CLIENT_ID/ML_CLIENT_SECRET ausentes.");
  return tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  );
}

export async function refreshToken(refresh: string): Promise<TokenResponse> {
  const clientId = process.env.ML_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("ML_CLIENT_ID/ML_CLIENT_SECRET ausentes.");
  return tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
    }),
  );
}

/** Persist tokens (encrypted) for the given user via the service-role client. */
export async function persistTokens(userId: string, t: TokenResponse): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const expiresAt = new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString();
  const { error } = await supabaseAdmin
    .from("mercadolivre_integrations")
    .upsert(
      {
        user_id: userId,
        ml_user_id: String(t.user_id),
        access_token_ciphertext: encryptSecret(t.access_token),
        refresh_token_ciphertext: encryptSecret(t.refresh_token),
        expires_at: expiresAt,
        scope: t.scope ?? null,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "user_id" },
    );
  if (error) throw new Error(`Falha ao gravar integração ML: ${error.message}`);
}

export type MLIntegrationView = {
  connected: boolean;
  mlUserId: string | null;
  expiresAt: string | null;
  scope: string | null;
  updatedAt: string | null;
};

export async function readIntegrationView(userId: string): Promise<MLIntegrationView> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("mercadolivre_integrations")
    .select("ml_user_id, expires_at, scope, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { connected: false, mlUserId: null, expiresAt: null, scope: null, updatedAt: null };
  return {
    connected: true,
    mlUserId: (data as { ml_user_id: string | null }).ml_user_id,
    expiresAt: (data as { expires_at: string }).expires_at,
    scope: (data as { scope: string | null }).scope,
    updatedAt: (data as { updated_at: string }).updated_at,
  };
}

export async function deleteIntegration(userId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("mercadolivre_integrations")
    .delete()
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export class MLNotConnectedError extends Error {
  constructor() { super("Conta Mercado Livre não conectada. Conecte em Configurações › Afiliados."); }
}
export class MLTokenExpiredError extends Error {
  constructor() { super("Token Mercado Livre expirado. Reconecte a integração."); }
}

/**
 * Load a valid access_token for the user. Auto-refreshes when close to expiry.
 * Throws MLNotConnectedError / MLTokenExpiredError with friendly messages.
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("mercadolivre_integrations")
    .select("access_token_ciphertext, refresh_token_ciphertext, expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new MLNotConnectedError();

  const row = data as {
    access_token_ciphertext: string;
    refresh_token_ciphertext: string;
    expires_at: string;
  };
  const expiresAtMs = new Date(row.expires_at).getTime();
  const stillValid = expiresAtMs - Date.now() > 30_000;
  if (stillValid) {
    try { return decryptSecret(row.access_token_ciphertext); }
    catch { /* fall through to refresh */ }
  }

  // Refresh.
  let refresh: string;
  try { refresh = decryptSecret(row.refresh_token_ciphertext); }
  catch { throw new MLTokenExpiredError(); }

  try {
    const fresh = await refreshToken(refresh);
    await persistTokens(userId, fresh);
    return fresh.access_token;
  } catch (e) {
    console.error("[ML][oauth] refresh failed", e instanceof Error ? e.message : e);
    throw new MLTokenExpiredError();
  }
}
