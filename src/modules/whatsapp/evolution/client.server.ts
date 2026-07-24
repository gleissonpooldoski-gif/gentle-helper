/**
 * Cliente HTTP centralizado para a Evolution API.
 * Todas as chamadas passam por aqui — usa apikey via header.
 */

export interface EvolutionClientConfig {
  baseUrl: string;
  apiKey: string;
}

export function getEvolutionConfig(): EvolutionClientConfig {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error(
      "Evolution API não configurada. Defina EVOLUTION_API_URL e EVOLUTION_API_KEY.",
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

export async function evolutionFetch(
  path: string,
  init: RequestInit & { config?: EvolutionClientConfig } = {},
): Promise<Response> {
  const cfg = init.config ?? getEvolutionConfig();
  const headers = new Headers(init.headers);
  headers.set("apikey", cfg.apiKey);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const url = `${cfg.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  return fetch(url, { ...init, headers });
}

export async function evolutionJson<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await evolutionFetch(path, init);
  const text = await res.text();
  if (!res.ok) {
    // Retorna corpo cru para diagnóstico
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
