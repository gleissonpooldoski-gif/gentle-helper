/**
 * Cliente HTTP resiliente para scraping.
 * - Rotação de User-Agents realistas
 * - Rotação de proxies (residenciais recomendados)
 * - Retry com backoff exponencial + jitter
 * - Circuit breaker por host
 * - Timeout duro por requisição
 */

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
];

const ACCEPT_LANGUAGES = ["pt-BR,pt;q=0.9,en;q=0.6", "pt-BR,pt;q=0.9"];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export interface ProxyProvider {
  /** Retorna a próxima proxy a usar (ex: http://user:pass@host:port). `null` = direto. */
  next(): string | null;
  /** Marca uma proxy como banida temporariamente por um host. */
  reportBlocked(proxy: string, host: string): void;
}

export class RotatingProxyProvider implements ProxyProvider {
  private idx = 0;
  private banned = new Map<string, number>(); // key = `${proxy}|${host}`
  constructor(private readonly proxies: string[], private readonly banMs = 5 * 60_000) {}

  next(): string | null {
    if (this.proxies.length === 0) return null;
    for (let i = 0; i < this.proxies.length; i++) {
      const p = this.proxies[(this.idx + i) % this.proxies.length]!;
      const bannedUntil = this.banned.get(p);
      if (!bannedUntil || bannedUntil < Date.now()) {
        this.idx = (this.idx + i + 1) % this.proxies.length;
        return p;
      }
    }
    return null; // todos banidos, cai pra direto
  }

  reportBlocked(proxy: string, host: string): void {
    this.banned.set(`${proxy}|${host}`, Date.now() + this.banMs);
  }
}

class CircuitBreaker {
  private failures = new Map<string, { count: number; openedAt: number }>();
  constructor(private readonly threshold = 5, private readonly cooldownMs = 60_000) {}

  isOpen(host: string): boolean {
    const s = this.failures.get(host);
    if (!s) return false;
    if (s.count < this.threshold) return false;
    if (Date.now() - s.openedAt > this.cooldownMs) {
      this.failures.delete(host);
      return false;
    }
    return true;
  }
  recordFailure(host: string) {
    const s = this.failures.get(host) ?? { count: 0, openedAt: Date.now() };
    s.count++;
    s.openedAt = Date.now();
    this.failures.set(host, s);
  }
  recordSuccess(host: string) {
    this.failures.delete(host);
  }
}

export interface FetchOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  headers?: Record<string, string>;
}

export class ResilientHttpClient {
  private readonly breaker = new CircuitBreaker();

  constructor(private readonly proxies: ProxyProvider = new RotatingProxyProvider([])) {}

  async get(url: string, opts: FetchOptions = {}): Promise<{ status: number; body: string }> {
    const host = new URL(url).hostname;
    if (this.breaker.isOpen(host)) {
      throw new ScrapeError("blocked", `Circuit open for ${host}`);
    }

    const maxAttempts = opts.maxAttempts ?? 4;
    const timeoutMs = opts.timeoutMs ?? 15_000;
    let lastErr: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const proxy = this.proxies.next();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          // NOTE: Node fetch honra HTTPS_PROXY via undici Agent — inject via dispatcher em prod.
          headers: {
            "user-agent": pick(USER_AGENTS),
            "accept-language": pick(ACCEPT_LANGUAGES),
            accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            ...opts.headers,
          },
        });
        clearTimeout(timer);

        if (res.status === 429 || res.status === 403) {
          if (proxy) this.proxies.reportBlocked(proxy, host);
          throw new ScrapeError("blocked", `HTTP ${res.status} on ${host}`);
        }
        if (res.status >= 500) throw new ScrapeError("unknown", `HTTP ${res.status}`);

        this.breaker.recordSuccess(host);
        return { status: res.status, body: await res.text() };
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;
        this.breaker.recordFailure(host);
        const backoff = Math.min(2 ** attempt * 250, 8_000) + Math.random() * 250;
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
    throw lastErr instanceof Error ? lastErr : new ScrapeError("unknown", "fetch failed");
  }
}

export class ScrapeError extends Error {
  constructor(
    public readonly code:
      | "blocked"
      | "not_found"
      | "parse_error"
      | "timeout"
      | "unsupported_marketplace"
      | "unknown",
    message: string,
  ) {
    super(message);
    this.name = "ScrapeError";
  }
}
