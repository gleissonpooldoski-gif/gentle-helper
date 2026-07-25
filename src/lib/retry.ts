/**
 * Retry com backoff exponencial + jitter.
 * Uso: await retryWithBackoff(() => fetch(...), { retries: 3 });
 */
export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Retorne false para NÃO retentar (ex.: 4xx). Default: retenta tudo. */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const {
    retries = 3,
    baseDelayMs = 500,
    maxDelayMs = 8_000,
    shouldRetry = () => true,
    onRetry,
  } = opts;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === retries || !shouldRetry(err, attempt)) {
        throw err;
      }
      const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const jitter = Math.random() * exp * 0.3;
      const delay = Math.floor(exp + jitter);
      onRetry?.(err, attempt + 1, delay);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/** Heurística: retenta 5xx, timeout, network. Não retenta 4xx. */
export function isTransientError(err: unknown): boolean {
  if (!err) return false;
  const msg = String((err as Error)?.message ?? err).toLowerCase();
  if (msg.includes("timeout") || msg.includes("econnreset") || msg.includes("fetch failed"))
    return true;
  // status HTTP embutido em erros do tipo "HTTP 502: ..."
  const m = msg.match(/http\s*(\d{3})/);
  if (m) {
    const code = Number(m[1]);
    return code >= 500 || code === 429;
  }
  return true; // desconhecido → tenta de novo (idempotente)
}
