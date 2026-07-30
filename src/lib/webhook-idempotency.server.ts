/**
 * Idempotência de eventos externos (webhooks, callbacks, ticks).
 *
 * Registra recebimento único por (provider, event_id) em `public.webhook_events`.
 * O registro acontece ANTES do efeito colateral: se o INSERT colidir com a
 * UNIQUE, o evento já foi recebido e deve ser ignorado.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { obsLog } from "@/lib/obs-log";

/**
 * @returns true quando o evento JÁ foi processado antes (duplicata → ignorar).
 */
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
  if ((error as { code?: string }).code === "23505") {
    obsLog("idempotency", "IDEMPOTENCY_HIT", { provider, event_id: eventId });
    return true;
  }
  // Outro erro → não bloqueia processamento, apenas loga
  console.warn("[webhook-idempotency] insert falhou:", error.message);
  return false;
}

/**
 * Executa `fn` no máximo uma vez por (provider, eventId).
 * Duplicatas retornam `{ duplicate: true }` sem executar nenhum efeito.
 */
export async function runOnce<T>(
  provider: string,
  eventId: string | null | undefined,
  fn: () => Promise<T>,
  opts: { payloadHash?: string; scope?: string } = {},
): Promise<{ duplicate: boolean; result?: T }> {
  const scope = opts.scope ?? provider;
  if (!eventId) {
    // Sem chave de idempotência não há como deduplicar: executa e avisa.
    return { duplicate: false, result: await fn() };
  }
  if (await isDuplicateWebhook(provider, eventId, opts.payloadHash)) {
    obsLog(scope, "DUPLICATE_EVENT_IGNORED", { provider, event_id: eventId });
    return { duplicate: true };
  }
  return { duplicate: false, result: await fn() };
}

/** Hash estável e curto de um corpo de requisição (para auditoria, não segurança). */
export function hashPayload(body: string): string {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) {
    h1 ^= body.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  return `${h1.toString(16)}-${body.length}`;
}
