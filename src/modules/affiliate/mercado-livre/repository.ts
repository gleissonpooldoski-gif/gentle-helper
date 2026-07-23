/**
 * Data-access layer for the Mercado Livre affiliate connection.
 * Uses the RLS-scoped supabase client injected by requireSupabaseAuth.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type MLConnectionRow = {
  affiliate_link: string | null;
  cookie_encrypted: string | null;
  affiliate_tag: string | null;
  status: string;
  last_error: string | null;
  updated_at: string;
};

const PLATFORM = "mercado_livre" as const;

export async function findConnection(
  supabase: SupabaseClient,
  userId: string,
): Promise<MLConnectionRow | null> {
  const { data, error } = await supabase
    .from("affiliate_connections")
    .select("affiliate_link, cookie_encrypted, affiliate_tag, status, last_error, updated_at")
    .eq("user_id", userId)
    .eq("platform", PLATFORM)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MLConnectionRow | null) ?? null;
}

export async function upsertConnection(
  supabase: SupabaseClient,
  userId: string,
  values: {
    affiliate_link: string;
    cookie_encrypted: string | null;
    affiliate_tag: string | null;
    status: string;
    last_error: string | null;
  },
): Promise<MLConnectionRow> {
  const { data, error } = await supabase
    .from("affiliate_connections")
    .upsert(
      { user_id: userId, platform: PLATFORM, ...values },
      { onConflict: "user_id,platform" },
    )
    .select("affiliate_link, cookie_encrypted, affiliate_tag, status, last_error, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return data as MLConnectionRow;
}

export async function updateStatus(
  supabase: SupabaseClient,
  userId: string,
  status: string,
  lastError: string | null,
) {
  const { error } = await supabase
    .from("affiliate_connections")
    .update({ status, last_error: lastError })
    .eq("user_id", userId)
    .eq("platform", PLATFORM);
  if (error) throw new Error(error.message);
}
