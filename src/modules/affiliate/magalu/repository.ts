/**
 * Data-access layer for the Magalu affiliate connection.
 * Uses the RLS-scoped supabase client injected by requireSupabaseAuth.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type MagaluConnectionRow = {
  store_name: string | null;
  status: string;
  last_error: string | null;
  updated_at: string;
};

const PLATFORM = "magalu" as const;
const SELECT_COLS = "store_name, status, last_error, updated_at";

export async function findConnection(
  supabase: SupabaseClient,
  userId: string,
): Promise<MagaluConnectionRow | null> {
  const { data, error } = await supabase
    .from("affiliate_connections")
    .select(SELECT_COLS)
    .eq("user_id", userId)
    .eq("platform", PLATFORM)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MagaluConnectionRow | null) ?? null;
}

export async function upsertConnection(
  supabase: SupabaseClient,
  userId: string,
  values: { store_name: string; status: string; last_error: string | null },
): Promise<MagaluConnectionRow> {
  const { data, error } = await supabase
    .from("affiliate_connections")
    .upsert(
      { user_id: userId, platform: PLATFORM, ...values },
      { onConflict: "user_id,platform" },
    )
    .select(SELECT_COLS)
    .single();
  if (error) throw new Error(error.message);
  return data as MagaluConnectionRow;
}
