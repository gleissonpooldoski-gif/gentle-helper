/**
 * Timeout obrigatório para toda chamada HTTP externa.
 *
 * Regra: nenhum worker pode ficar bloqueado indefinidamente por uma
 * integração externa lenta. Toda falha é classificada (timeout / auth /
 * api / network) para que o chamador possa decidir sem derrubar o ciclo.
 *
 * NÃO altera regras de CLAIM, envio WhatsApp ou automações.
 */

export type ExternalErrorKind = "timeout" | "auth" | "api" | "network";

export class ExternalHttpError extends Error {
  readonly kind: ExternalErrorKind;
  readonly label: string;
  readonly status?: number;
  readonly elapsedMs: number;

  constructor(input: {
    kind: ExternalErrorKind;
    label: string;
    message: string;
    status?: number;
    elapsedMs: number;
  }) {
    super(input.message);
    this.name = "ExternalHttpError";
    this.kind = input.kind;
    this.label = input.label;
    this.status = input.status;
    this.elapsedMs = input.elapsedMs;
  }
}

export function isTimeoutError(e: unknown): boolean {
  if (e instanceof ExternalHttpError) return e.kind === "timeout";
  const name = (e as { name?: string } | null)?.name;
  return name === "AbortError" || name === "TimeoutError";
}

/** Timeouts padrão por tipo de chamada (ms). */
export const TIMEOUTS = {
  /** APIs JSON: Meta Graph, Mercado Livre, OAuth. */
  api: 10_000,
  /** Geração por IA (respostas longas). */
  ai: 20_000,
  /** Download de imagem / binário. */
  media: 12_000,
  /** Redirect resolution / probes / healthcheck. */
  probe: 8_000,
} as const;

function logExternal(payload: Record<string, unknown>) {
  try {
    console.error(JSON.stringify({ scope: "external_http", ...payload }));
  } catch {
    /* noop */
  }
}

/**
 * `fetch` com AbortController. Lança `ExternalHttpError` com kind=timeout
 * quando estoura o tempo, ou kind=network para falhas de transporte.
 * Respostas HTTP (inclusive 4xx/5xx) são devolvidas normalmente — a
 * classificação de auth/api fica com `classifyResponse`.
 */
export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  opts: { timeoutMs?: number; label: string },
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? TIMEOUTS.api;
  const label = opts.label;
  const controller = new AbortController();
  const started = Date.now();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (e) {
    const elapsedMs = Date.now() - started;
    if (isTimeoutError(e)) {
      logExternal({ event: "EXTERNAL_TIMEOUT", label, timeoutMs, elapsedMs });
      throw new ExternalHttpError({
        kind: "timeout",
        label,
        elapsedMs,
        message: `[${label}] timeout após ${timeoutMs}ms`,
      });
    }
    logExternal({
      event: "EXTERNAL_NETWORK_ERROR",
      label,
      elapsedMs,
      error: String((e as Error)?.message ?? e),
    });
    throw new ExternalHttpError({
      kind: "network",
      label,
      elapsedMs,
      message: `[${label}] falha de rede: ${String((e as Error)?.message ?? e)}`,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Diferencia erro de autenticação (401/403) de erro genérico de API. */
export function classifyResponse(
  res: Response,
  label: string,
  detail?: string,
): ExternalHttpError | null {
  if (res.ok) return null;
  const kind: ExternalErrorKind =
    res.status === 401 || res.status === 403 ? "auth" : "api";
  logExternal({
    event: kind === "auth" ? "EXTERNAL_AUTH_ERROR" : "EXTERNAL_API_ERROR",
    label,
    status: res.status,
    detail: detail?.slice(0, 300),
  });
  return new ExternalHttpError({
    kind,
    label,
    status: res.status,
    elapsedMs: 0,
    message: `[${label}] HTTP ${res.status}${detail ? ` ${detail.slice(0, 300)}` : ""}`,
  });
}
