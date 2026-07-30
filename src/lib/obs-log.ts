/**
 * Logs estruturados single-line (JSON) para observabilidade de produção.
 *
 * Eventos padronizados exigidos pela fase de produção:
 *   PROCESS_STARTED / PROCESS_COMPLETED
 *   IDEMPOTENCY_HIT / DUPLICATE_EVENT_IGNORED / SIDE_EFFECT_BLOCKED
 *
 * Regras:
 *  - nunca lança (log nunca pode derrubar um fluxo);
 *  - nunca imprime segredos (chaves conhecidas são mascaradas);
 *  - sempre uma linha só, para facilitar busca nos logs do worker.
 */

export type ObsEvent =
  | "PROCESS_STARTED"
  | "PROCESS_COMPLETED"
  | "PROCESS_FAILED"
  | "IDEMPOTENCY_HIT"
  | "DUPLICATE_EVENT_IGNORED"
  | "SIDE_EFFECT_BLOCKED"
  | "RATE_LIMIT_BLOCKED"
  | "UNSAFE_REDIRECT_BLOCKED"
  | "ALERT_OPENED"
  | "ALERT_RESOLVED"
  | "METRICS_SNAPSHOT"
  | "RETENTION_RUN";

const SECRET_KEYS = /(token|secret|apikey|api_key|password|authorization|ciphertext)/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (depth > 3) return "[deep]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) ? "[redacted]" : sanitize(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 500) return value.slice(0, 500) + "…";
  return value;
}

export function obsLog(scope: string, event: ObsEvent, data: Record<string, unknown> = {}): void {
  try {
    const line = JSON.stringify({
      scope,
      event,
      at: new Date().toISOString(),
      ...(sanitize(data) as Record<string, unknown>),
    });
    if (event === "PROCESS_FAILED") console.error(line);
    else console.log(line);
  } catch {
    /* logging nunca quebra o fluxo */
  }
}

/** Envolve um processo com PROCESS_STARTED / PROCESS_COMPLETED / PROCESS_FAILED. */
export async function withProcessLog<T>(
  scope: string,
  meta: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  obsLog(scope, "PROCESS_STARTED", meta);
  try {
    const result = await fn();
    obsLog(scope, "PROCESS_COMPLETED", { ...meta, duration_ms: Date.now() - started });
    return result;
  } catch (error) {
    obsLog(scope, "PROCESS_FAILED", {
      ...meta,
      duration_ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
