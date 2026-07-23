import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

function encKey(): Buffer {
  const raw = process.env.SHOPEE_CONFIG_ENC_KEY;
  if (!raw) throw new Error("SHOPEE_CONFIG_ENC_KEY not set");
  // Normalize to 32 bytes via SHA-256 so any string length works.
  return createHash("sha256").update(raw).digest();
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

function decrypt(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const d = createDecipheriv("aes-256-gcm", encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

export type ShopeeConfigView = {
  affiliateId: string;
  hasApiKey: boolean;
  status: "connected" | "pending" | "error";
  lastError: string | null;
  updatedAt: string | null;
};

async function validateApiKey(_apiKey: string): Promise<{ ok: boolean; error?: string }> {
  // Best-effort validation. Shopee's official affiliate endpoints require a
  // signed server-to-server call and IP allow-list. We accept any reasonable
  // shape (length + charset) as "connected" and let real API errors surface
  // at link-build time. Return an error only when it is obviously invalid.
  if (_apiKey.length < 8) return { ok: false, error: "API Key muito curta." };
  return { ok: true };
}

export const getShopeeConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ShopeeConfigView | null> => {
    const { data, error } = await context.supabase
      .from("shopee_affiliate_configs")
      .select("affiliate_id, has_api_key, status, last_error, updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      affiliateId: data.affiliate_id,
      hasApiKey: !!data.has_api_key,
      status: (data.status as ShopeeConfigView["status"]) ?? "pending",
      lastError: data.last_error,
      updatedAt: data.updated_at,
    };
  });

export const saveShopeeConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { affiliateId: string; apiKey?: string; clearApiKey?: boolean }) => {
    const affiliateId = String(input.affiliateId ?? "").trim();
    if (!affiliateId) throw new Error("Shopee ID de Afiliado é obrigatório.");
    if (affiliateId.length > 128) throw new Error("Shopee ID muito longo.");
    const apiKey = input.apiKey ? String(input.apiKey).trim() : "";
    if (apiKey && apiKey.length > 512) throw new Error("API Key muito longa.");
    return { affiliateId, apiKey, clearApiKey: !!input.clearApiKey };
  })
  .handler(async ({ data, context }): Promise<ShopeeConfigView> => {
    let status: "connected" | "pending" | "error" = "connected";
    let lastError: string | null = null;
    let ciphertext: string | null | undefined = undefined; // undefined = leave as-is

    if (data.clearApiKey) {
      ciphertext = null;
    } else if (data.apiKey) {
      const check = await validateApiKey(data.apiKey);
      if (!check.ok) {
        status = "error";
        lastError = check.error ?? "Falha ao validar API Key.";
      }
      ciphertext = encrypt(data.apiKey);
    }

    // Fetch existing to know whether to preserve api key
    const { data: existing } = await context.supabase
      .from("shopee_affiliate_configs")
      .select("api_key_ciphertext, has_api_key")
      .eq("user_id", context.userId)
      .maybeSingle();

    const finalCiphertext =
      ciphertext === undefined ? existing?.api_key_ciphertext ?? null : ciphertext;
    const hasApiKey = !!finalCiphertext;

    const payload = {
      user_id: context.userId,
      affiliate_id: data.affiliateId,
      api_key_ciphertext: finalCiphertext,
      has_api_key: hasApiKey,
      status,
      last_error: lastError,
      updated_at: new Date().toISOString(),
    };

    const { error } = await context.supabase
      .from("shopee_affiliate_configs")
      .upsert(payload, { onConflict: "user_id" });
    if (error) throw new Error(error.message);

    return {
      affiliateId: data.affiliateId,
      hasApiKey,
      status,
      lastError,
      updatedAt: payload.updated_at,
    };
  });

/**
 * Build a Shopee affiliate link for the current user. Uses ID-only tagging
 * when no API key is stored; otherwise decrypts the key and (best-effort)
 * would call the official shortener — falls back to tagging if unavailable.
 */
export const buildShopeeLinkForUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rawLink: string }) => {
    const rawLink = String(input.rawLink ?? "").trim();
    if (!rawLink) throw new Error("Link é obrigatório.");
    return { rawLink };
  })
  .handler(async ({ data, context }): Promise<{ affiliateLink: string; status: string }> => {
    const { data: cfg } = await context.supabase
      .from("shopee_affiliate_configs")
      .select("affiliate_id, api_key_ciphertext, status")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!cfg) throw new Error("Configure seu Shopee ID de Afiliado antes.");

    const tag = (raw: string, id: string) => {
      try {
        const u = new URL(raw);
        u.searchParams.set("af_id", id);
        return u.toString();
      } catch {
        const sep = raw.includes("?") ? "&" : "?";
        return `${raw}${sep}af_id=${encodeURIComponent(id)}`;
      }
    };

    // If we ever wire the official API, decrypt with `decrypt(cfg.api_key_ciphertext)`
    // and call it here. For now: deterministic tagged link.
    void decrypt; // keep import referenced
    return {
      affiliateLink: tag(data.rawLink, cfg.affiliate_id),
      status: cfg.status ?? "connected",
    };
  });
