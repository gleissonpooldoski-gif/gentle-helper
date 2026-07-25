/**
 * Circuit Breaker por instância WhatsApp — persistido em Postgres.
 * Estados: closed (ok) | open (bloqueada) | half-open (teste).
 *
 * Uso dentro do worker:
 *   if (await isBreakerOpen(instanceId)) return skip();
 *   try { await sendMessage(); await recordSuccess(instanceId); }
 *   catch (err) { await recordFailure(instanceId, userId, err); throw; }
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FAILURE_THRESHOLD = 5; // 5 falhas seguidas => abre
const OPEN_DURATION_MS = 5 * 60_000; // fica bloqueada 5 min

interface BreakerRow {
  failure_count: number;
  opened_at: string | null;
  next_attempt_at: string | null;
}

export async function isBreakerOpen(instanceId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("instance_circuit_breakers")
    .select("opened_at, next_attempt_at")
    .eq("instance_id", instanceId)
    .maybeSingle<Pick<BreakerRow, "opened_at" | "next_attempt_at">>();

  if (!data?.opened_at || !data.next_attempt_at) return false;
  return Date.parse(data.next_attempt_at) > Date.now();
}

export async function recordSuccess(instanceId: string): Promise<void> {
  await supabaseAdmin
    .from("instance_circuit_breakers")
    .upsert(
      {
        instance_id: instanceId,
        failure_count: 0,
        opened_at: null,
        next_attempt_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "instance_id" },
    );
}

export async function recordFailure(
  instanceId: string,
  userId: string,
  err: unknown,
): Promise<{ opened: boolean }> {
  const { data: existing } = await supabaseAdmin
    .from("instance_circuit_breakers")
    .select("failure_count")
    .eq("instance_id", instanceId)
    .maybeSingle<Pick<BreakerRow, "failure_count">>();

  const nextCount = (existing?.failure_count ?? 0) + 1;
  const opened = nextCount >= FAILURE_THRESHOLD;
  const now = Date.now();

  await supabaseAdmin.from("instance_circuit_breakers").upsert(
    {
      instance_id: instanceId,
      user_id: userId,
      failure_count: nextCount,
      opened_at: opened ? new Date(now).toISOString() : null,
      next_attempt_at: opened
        ? new Date(now + OPEN_DURATION_MS).toISOString()
        : null,
      last_error: String((err as Error)?.message ?? err).slice(0, 500),
      updated_at: new Date(now).toISOString(),
    },
    { onConflict: "instance_id" },
  );

  return { opened };
}
