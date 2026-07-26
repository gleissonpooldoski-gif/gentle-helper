/**
 * Cliente HTTP centralizado para a Evolution API.
 * A URL base fica salva em `public.evolution_settings`.
 * Ela é relida em cada verificação para túneis temporários nunca usarem URL antiga.
 */

export interface EvolutionClientConfig {
  baseUrl: string;
  apiKey: string;
}

async function resolveBaseUrl(): Promise<string> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("evolution_settings" as any)
      .select("base_url")
      .eq("id", "global")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return String((data as any)?.base_url ?? "").trim().replace(/\/+$/, "");
  } catch (error) {
    throw new Error(
      `Não foi possível carregar a URL salva da Evolution API: ${
        error instanceof Error ? error.message : "erro no banco"
      }`,
    );
  }
}

export function invalidateEvolutionConfigCache() {
  // Mantida por compatibilidade. A configuração não usa mais cache em memória.
}

export async function getEvolutionConfig(): Promise<EvolutionClientConfig> {
  const baseUrl = await resolveBaseUrl();
  const apiKey = process.env.EVOLUTION_API_KEY ?? "";
  if (!baseUrl || !apiKey) {
    throw new Error(
      "Evolution API não configurada. Defina a URL pública em Configurações da Evolution.",
    );
  }
  return { baseUrl, apiKey };
}

const TUNNEL_OFFLINE_MSG = "Tunnel Cloudflare offline. Atualize a URL da Evolution API.";

export function isTunnelOfflineStatus(status: number): boolean {
  // Cloudflare edge: 530 (origin down / 1016 no DNS), 522/523/524 tunnel/timeout
  return status === 530 || status === 522 || status === 523 || status === 524;
}

/** Erros transitórios que devem ser retentados automaticamente. */
function isRetriableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function isRetriableError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err).toLowerCase();
  return /fetch failed|network|timeout|econnreset|econnrefused|etimedout|abort|socket|eai_again/.test(
    msg,
  );
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function friendlyError(err: unknown, path: string): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    /Tunnel|error code: ?1016|error code: ?1033|cloudflare/i.test(msg) ||
    /\b(530|522|523|524)\b/.test(msg)
  ) {
    return new Error(TUNNEL_OFFLINE_MSG);
  }
  if (
    /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|Failed to fetch|abort/i.test(
      msg,
    )
  ) {
    return new Error("Evolution API indisponível. Verifique a conexão.");
  }
  return new Error(`Evolution ${path}: ${msg}`);
}

export interface EvolutionFetchInit extends RequestInit {
  config?: EvolutionClientConfig;
  timeoutMs?: number;
  /** Número máximo de retentativas em erros transitórios (5xx/network). Default 2. */
  retries?: number;
}

async function doFetchOnce(
  path: string,
  init: EvolutionFetchInit,
  cfg: EvolutionClientConfig,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("apikey", cfg.apiKey);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const url = `${cfg.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), init.timeoutMs ?? 15_000);
  try {
    return await fetch(url, { ...init, headers, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function evolutionFetch(
  path: string,
  init: EvolutionFetchInit = {},
): Promise<Response> {
  const cfg = init.config ?? (await getEvolutionConfig());
  const retries = init.retries ?? 2;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await doFetchOnce(path, init, cfg);
      if (isRetriableStatus(res.status) && attempt < retries) {
        // eslint-disable-next-line no-console
        console.warn(
          `[Evolution] ${res.status} em ${path} (tentativa ${attempt + 1}/${retries + 1}), retentando…`,
        );
        await sleep(400 * 2 ** attempt + Math.random() * 200);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries && isRetriableError(err)) {
        // eslint-disable-next-line no-console
        console.warn(
          `[Evolution] erro transitório em ${path} (tentativa ${attempt + 1}/${retries + 1}):`,
          (err as Error)?.message ?? err,
        );
        await sleep(400 * 2 ** attempt + Math.random() * 200);
        continue;
      }
      throw friendlyError(err, path);
    }
  }
  throw friendlyError(lastErr ?? new Error("falha desconhecida"), path);
}

export async function evolutionJson<T = unknown>(
  path: string,
  init: EvolutionFetchInit = {},
): Promise<T> {
  const res = await evolutionFetch(path, init);
  const text = await res.text();
  if (!res.ok) {
    if (isTunnelOfflineStatus(res.status) || /error code: ?1016|error code: ?1033|cloudflare/i.test(text)) {
      throw new Error(TUNNEL_OFFLINE_MSG);
    }
    if (isRetriableStatus(res.status)) {
      throw new Error(
        `Evolution API temporariamente indisponível (${res.status}). Nova tentativa automática em instantes.`,
      );
    }
    throw new Error(
      `Evolution API ${res.status} em ${path}: ${text.slice(0, 500)}`,
    );
  }
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}
