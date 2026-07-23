import { createCipheriv, createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const PLATFORM = "shopee" as const;

export type ShopeeConfigView = {
  affiliateId: string;
  hasApiKey: boolean;
  status: "connected" | "pending" | "error";
  lastError: string | null;
  updatedAt: string | null;
};

function encryptionKey(): Buffer {
  const raw = process.env.SHOPEE_CONFIG_ENC_KEY;
  if (!raw) throw new Error("AFFILIATE_ENCRYPTION_UNAVAILABLE");
  return createHash("sha256").update(raw).digest();
}

function encryptApiKey(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

function toView(row: {
  affiliate_id: string | null;
  api_key_encrypted: string | null;
  status: string;
  last_error: string | null;
  updated_at: string;
} | null): ShopeeConfigView | null {
  if (!row) return null;
  return {
    affiliateId: row.affiliate_id ?? "",
    hasApiKey: Boolean(row.api_key_encrypted),
    status: (row.status as ShopeeConfigView["status"]) ?? "pending",
    lastError: row.last_error,
    updatedAt: row.updated_at,
  };
}

export async function getShopeeConnection(
  supabase: SupabaseClient,
  userId: string,
): Promise<ShopeeConfigView | null> {
  const { data, error } = await supabase
    .from("affiliate_connections")
    .select("affiliate_id, api_key_encrypted, status, last_error, updated_at")
    .eq("user_id", userId)
    .eq("platform", PLATFORM)
    .maybeSingle();
  if (error) throw error;
  return toView(data);
}

export async function saveShopeeConnection(
  supabase: SupabaseClient,
  userId: string,
  input: { affiliateId: string; apiKey?: string; clearApiKey?: boolean },
): Promise<ShopeeConfigView> {
  const existing = await getShopeeConnection(supabase, userId);
  let apiKeyEncrypted: string | null | undefined;

  if (input.clearApiKey) apiKeyEncrypted = null;
  else if (input.apiKey) apiKeyEncrypted = encryptApiKey(input.apiKey);

  const finalApiKey = apiKeyEncrypted === undefined
    ? existing?.hasApiKey
      ? (await supabase
          .from("affiliate_connections")
          .select("api_key_encrypted")
          .eq("user_id", userId)
          .eq("platform", PLATFORM)
          .single()).data?.api_key_encrypted ?? null
      : null
    : apiKeyEncrypted;

  const updatedAt = new Date().toISOString();
  const payload = {
    user_id: userId,
    platform: PLATFORM,
    affiliate_id: input.affiliateId,
    api_key_encrypted: finalApiKey,
    status: "connected",
    last_error: null,
    updated_at: updatedAt,
  };
  const { data, error } = await supabase
    .from("affiliate_connections")
    .upsert(payload, { onConflict: "user_id,platform" })
    .select("affiliate_id, api_key_encrypted, status, last_error, updated_at")
    .single();
  if (error) throw error;
  return toView(data)!;
}

export async function getShopeeAffiliateId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const config = await getShopeeConnection(supabase, userId);
  return config?.affiliateId || null;
}