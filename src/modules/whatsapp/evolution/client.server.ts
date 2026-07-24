/**
 * Cliente HTTP centralizado para a Evolution API.
 * A URL base fica salva em `public.evolution_settings` (fallback: env).
 * Cache curto em memória para evitar hit no banco a cada request.
 */

export interface EvolutionClientConfig {
  baseUrl: string;
  apiKey: string;
}

const CACHE_TTL_MS = 10_000;
let _cache: { at: number; baseUrl: string } | null = null;

async function resolveBaseUrl(): Promise<string> {
  if (_cache && Date.now() - _cache.at < CACHE_TTL_MS) return _cache.baseUrl;
  let fromDb = "";
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("evolution_settings" as any)
      .select("base_url")
      .eq("id", "global")
      .maybeSingle();
    fromDb = String((data as any)?.base_url ?? "").trim();
  } catch {
    /* ignore, fallback to env */
  }
  const baseUrl = (fromDb || process.env.EVOLUTION_API_URL || "").replace(/\/+$/, "");
  _cache = { at: Date.now(), baseUrl };
  return baseUrl;
}

export function invalidateEvolutionConfigCache() {
  _cache = null;
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

function friendlyError(err: unknown, path: string): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|Failed to fetch|Tunnel|522|523|524|530/i.test(
      msg,
    )
  ) {
    return new Error("Evolution API indisponível. Verifique a conexão.");
  }
  return new Error(`Evolution ${path}: ${msg}`);
}

export async function evolutionFetch(
  path: string,
  init: RequestInit & { config?: EvolutionClientConfig; timeoutMs?: number } = {},
): Promise<Response> {
  const cfg = init.config ?? (await getEvolutionConfig());
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
  } catch (err) {
    throw friendlyError(err, path);
  } finally {
    clearTimeout(t);
  }
}

export async function evolutionJson<T = unknown>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const res = await evolutionFetch(path, init);
  const text = await res.text();
  if (!res.ok) {
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
