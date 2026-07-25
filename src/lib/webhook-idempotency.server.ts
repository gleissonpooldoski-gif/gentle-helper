/**
 * Registra recebimento único de webhook por (provider, event_id).
 * Retorna true se já foi processado antes (duplicata → ignorar).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function isDuplicateWebhook(
  provider: string,
  eventId: string,
  payloadHash?: string,
): Promise<boolean> {
  if (!eventId) return false; // sem id, não dá pra deduplicar
  const { error } = await supabaseAdmin
    .from("webhook_events")
    .insert({ provider, event_id: eventId, payload_hash: payloadHash ?? null });

  if (!error) return false; // primeira vez
  // Postgres unique_violation
  if ((error as { code?: string }).code === "23505") return true;
  // Outro erro → não bloqueia processamento, apenas loga
  console.warn("[webhook-idempotency] insert falhou:", error.message);
  return false;
}
