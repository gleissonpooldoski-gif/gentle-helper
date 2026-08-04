/**
 * Cloudflare Quick Tunnel — detecção, validação e sincronização automática.
 *
 * Arquitetura (sem Named Tunnel, sem domínio pago):
 *   cloudflared reinicia -> nova URL trycloudflare.com
 *     -> watcher local (infra/tunnel-watcher) lê a URL do log do container
 *     -> faz POST em /api/public/hooks/tunnel-url com x-cron-secret
 *     -> este módulo valida, grava em evolution_settings, ressincroniza webhooks,
 *        invalida cache e registra o estado em cloudflare_tunnel_status.
 *
 * Segurança: nunca logamos apikey, CRON_SECRET ou tokens. Apenas host + status.
 */

export type TunnelStatus = "ONLINE" | "OFFLINE" | "CHANGED" | "ERROR";

export interface TunnelProbe {
  ok: boolean;
  status: TunnelStatus;
  httpStatus: number | null;
  latencyMs: number | null;
  message: string;
}

/** Log estruturado single-line, sem segredos. */
export function tunnelLog(tag: string, event: string, extra: Record<string, unknown> = {}) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ tag, event, at: new Date().toISOString(), ...extra }));
}

export function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "url-invalida";
  }
}

/**
 * Interpretação obrigatória dos códigos HTTP.
 * 200/401/403 => a API respondeu, logo o túnel está ONLINE.
 * 404 => túnel ok, rota/configuração errada.
 * 530/522/523/524 => erros de borda Cloudflare: túnel/origem fora do ar.
 */
export function classifyTunnelHttpStatus(httpStatus: number): {
  status: TunnelStatus;
  ok: boolean;
  message: string;
} {
  if (httpStatus === 200) return { status: "ONLINE", ok: true, message: "Evolution API online." };
  if (httpStatus === 401 || httpStatus === 403)
    return {
      status: "ONLINE",
      ok: true,
      message: `Túnel online, mas a API Key foi rejeitada (HTTP ${httpStatus}).`,
    };
  if (httpStatus === 404)
    return {
      status: "ERROR",
      ok: false,
      message: "Configuração errada: o túnel responde, mas o endpoint não existe (HTTP 404).",
    };
  if (httpStatus === 530)
    return { status: "OFFLINE", ok: false, message: "Cloudflare Tunnel offline (530)." };
  if (httpStatus === 522)
    return { status: "OFFLINE", ok: false, message: "Origem offline (522): a Evolution não responde ao túnel." };
  if (httpStatus === 523)
    return { status: "OFFLINE", ok: false, message: "Erro de DNS/túnel (523): origem inalcançável." };
  if (httpStatus === 524)
    return { status: "OFFLINE", ok: false, message: "Timeout (524): a origem demorou demais para responder." };
  if (httpStatus >= 200 && httpStatus < 500)
    return { status: "ONLINE", ok: true, message: `Túnel online (HTTP ${httpStatus}).` };
  return { status: "ERROR", ok: false, message: `Resposta inesperada da Evolution API (HTTP ${httpStatus}).` };
}

export function normalizeTunnelUrl(raw: string): string {
  const trimmed = String(raw ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("URL vazia");
  const parsed = new URL(trimmed);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("URL deve começar com http(s)");
  return `${parsed.protocol}//${parsed.host}`;
}

/** Testa GET {url}/instance/fetchInstances e classifica o resultado. */
export async function probeTunnel(baseUrl: string, timeoutMs = 8_000): Promise<TunnelProbe> {
  const apiKey = process.env.EVOLUTION_API_KEY ?? "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/instance/fetchInstances`, {
      headers: apiKey ? { apikey: apiKey } : undefined,
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    const cls = classifyTunnelHttpStatus(res.status);
    return { ok: cls.ok, status: cls.status, httpStatus: res.status, latencyMs, message: cls.message };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : String(err);
    if (/abort|timeout|ETIMEDOUT/i.test(msg)) {
      return {
        ok: false,
        status: "OFFLINE",
        httpStatus: null,
        latencyMs,
        message: "Timeout: o túnel Cloudflare não respondeu.",
      };
    }
    if (/ENOTFOUND|getaddrinfo|dns/i.test(msg)) {
      return {
        ok: false,
        status: "OFFLINE",
        httpStatus: null,
        latencyMs,
        message: "DNS não resolveu: a URL do túnel não existe mais.",
      };
    }
    return { ok: false, status: "ERROR", httpStatus: null, latencyMs, message: `Falha de rede: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}

interface TunnelRow {
  current_url: string | null;
  previous_url: string | null;
  status: string;
  last_change: string | null;
}

export async function readTunnelStatus(): Promise<TunnelRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("cloudflare_tunnel_status")
    .select("current_url, previous_url, status, last_change")
    .eq("id", "global")
    .maybeSingle();
  return (data as TunnelRow) ?? null;
}

export async function recordTunnelStatus(patch: {
  status: TunnelStatus;
  currentUrl?: string | null;
  previousUrl?: string | null;
  errorMessage?: string | null;
  httpStatus?: number | null;
  source?: string;
  markChanged?: boolean;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    id: "global",
    status: patch.status,
    last_check: now,
    error_message: patch.errorMessage ?? null,
    last_http_status: patch.httpStatus ?? null,
    updated_by_source: patch.source ?? "system",
    updated_at: now,
  };
  if (patch.currentUrl !== undefined) row.current_url = patch.currentUrl;
  if (patch.previousUrl !== undefined) row.previous_url = patch.previousUrl;
  if (patch.markChanged) row.last_change = now;
  await (supabaseAdmin as any)
    .from("cloudflare_tunnel_status")
    .upsert(row, { onConflict: "id" });
}

/** URL pública estável do SaaS que a Evolution deve chamar (independe do túnel). */
export function appWebhookUrl(): string {
  const base =
    process.env.PUBLIC_APP_URL?.replace(/\/+$/, "") ??
    "https://project--c8d0a9f8-2712-4d4d-b2f8-6b9530849b41.lovable.app";
  return `${base}/api/public/whatsapp/webhook`;
}

/** Reaplica o webhook do SaaS em todas as instâncias conhecidas da Evolution. */
export async function resyncEvolutionWebhooks(): Promise<{ synced: number; failed: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { evolutionProvider } = await import("./provider.server");
  const url = appWebhookUrl();

  const { data } = await (supabaseAdmin as any)
    .from("whatsapp_instances")
    .select("instance_name")
    .not("instance_name", "is", null);

  const names = ((data ?? []) as Array<{ instance_name: string }>)
    .map((r) => r.instance_name)
    .filter(Boolean);

  let synced = 0;
  let failed = 0;
  for (const name of names) {
    try {
      if (!evolutionProvider.setWebhook) break;
      await evolutionProvider.setWebhook(name, url);
      synced += 1;
      tunnelLog("WEBHOOK", "SYNCED", { instance: name });
    } catch (err) {
      failed += 1;
      tunnelLog("WEBHOOK", "SYNC_FAILED", {
        instance: name,
        error: err instanceof Error ? err.message : "erro",
      });
    }
  }
  return { synced, failed };
}

export interface ApplyTunnelResult {
  ok: boolean;
  changed: boolean;
  status: TunnelStatus;
  currentUrl: string | null;
  previousUrl: string | null;
  message: string;
  webhooks?: { synced: number; failed: number };
}

/**
 * Fluxo completo de troca de URL:
 * valida -> grava no banco -> ressincroniza webhooks -> invalida cache -> loga.
 */
export async function applyNewTunnelUrl(
  rawUrl: string,
  source = "watcher",
): Promise<ApplyTunnelResult> {
  let url: string;
  try {
    url = normalizeTunnelUrl(rawUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "URL inválida";
    await recordTunnelStatus({ status: "ERROR", errorMessage: message, source });
    return { ok: false, changed: false, status: "ERROR", currentUrl: null, previousUrl: null, message };
  }

  const existing = await readTunnelStatus();

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: settings } = await (supabaseAdmin as any)
    .from("evolution_settings")
    .select("base_url")
    .eq("id", "global")
    .maybeSingle();
  const savedUrl = String((settings as { base_url?: string } | null)?.base_url ?? "").replace(/\/+$/, "");

  // 1. Só aceitamos uma URL nova se ela realmente responder.
  const probe = await probeTunnel(url);
  if (!probe.ok) {
    tunnelLog("TUNNEL", "REJECTED_URL", { host: safeHost(url), httpStatus: probe.httpStatus });
    await recordTunnelStatus({
      status: probe.status,
      errorMessage: probe.message,
      httpStatus: probe.httpStatus,
      source,
    });
    return {
      ok: false,
      changed: false,
      status: probe.status,
      currentUrl: savedUrl || null,
      previousUrl: existing?.previous_url ?? null,
      message: `URL recebida não respondeu: ${probe.message}`,
    };
  }

  const changed = savedUrl !== url;

  if (!changed) {
    await recordTunnelStatus({
      status: "ONLINE",
      currentUrl: url,
      httpStatus: probe.httpStatus,
      errorMessage: null,
      source,
    });
    tunnelLog("HEALTH", "SYSTEM_ONLINE", { host: safeHost(url), latencyMs: probe.latencyMs });
    return {
      ok: true,
      changed: false,
      status: "ONLINE",
      currentUrl: url,
      previousUrl: existing?.previous_url ?? null,
      message: "URL já estava atualizada e o túnel está online.",
    };
  }

  tunnelLog("TUNNEL", "NEW_URL_DETECTED", { host: safeHost(url), previousHost: savedUrl ? safeHost(savedUrl) : null });

  // 2. Atualiza a fonte única da verdade.
  const { error: upErr } = await (supabaseAdmin as any).from("evolution_settings").upsert(
    { id: "global", base_url: url, updated_at: new Date().toISOString() },
    { onConflict: "id" },
  );
  if (upErr) {
    await recordTunnelStatus({ status: "ERROR", errorMessage: upErr.message, source });
    return {
      ok: false,
      changed: false,
      status: "ERROR",
      currentUrl: savedUrl || null,
      previousUrl: existing?.previous_url ?? null,
      message: `Falha ao gravar a nova URL: ${upErr.message}`,
    };
  }
  tunnelLog("EVOLUTION", "URL_UPDATED", { host: safeHost(url) });

  // 3. Invalida cache em memória (mantido por compatibilidade).
  const { invalidateEvolutionConfigCache } = await import("./client.server");
  invalidateEvolutionConfigCache();

  // 4. Ressincroniza webhooks das instâncias.
  const webhooks = await resyncEvolutionWebhooks();

  // 5. Registra o estado.
  await recordTunnelStatus({
    status: "CHANGED",
    currentUrl: url,
    previousUrl: savedUrl || null,
    httpStatus: probe.httpStatus,
    errorMessage: null,
    source,
    markChanged: true,
  });
  tunnelLog("TUNNEL", "TUNNEL_URL_UPDATED", {
    host: safeHost(url),
    webhooksSynced: webhooks.synced,
    webhooksFailed: webhooks.failed,
  });

  return {
    ok: true,
    changed: true,
    status: "CHANGED",
    currentUrl: url,
    previousUrl: savedUrl || null,
    message: "Nova URL do túnel aplicada e serviços ressincronizados.",
    webhooks,
  };
}

/** Health check periódico: valida a URL salva e atualiza o estado do túnel. */
export async function runTunnelHealthCheck(): Promise<{
  status: TunnelStatus;
  url: string | null;
  httpStatus: number | null;
  latencyMs: number | null;
  message: string;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("evolution_settings")
    .select("base_url")
    .eq("id", "global")
    .maybeSingle();
  const url = String((data as { base_url?: string } | null)?.base_url ?? "").replace(/\/+$/, "");

  if (!url) {
    await recordTunnelStatus({
      status: "OFFLINE",
      currentUrl: null,
      errorMessage: "Nenhuma URL de túnel configurada.",
      source: "healthcheck",
    });
    return {
      status: "OFFLINE",
      url: null,
      httpStatus: null,
      latencyMs: null,
      message: "Nenhuma URL de túnel configurada.",
    };
  }

  const probe = await probeTunnel(url);
  await recordTunnelStatus({
    status: probe.status,
    currentUrl: url,
    httpStatus: probe.httpStatus,
    errorMessage: probe.ok ? null : probe.message,
    source: "healthcheck",
  });
  tunnelLog("HEALTH", probe.ok ? "SYSTEM_ONLINE" : "SYSTEM_DEGRADED", {
    host: safeHost(url),
    httpStatus: probe.httpStatus,
    latencyMs: probe.latencyMs,
  });
  return {
    status: probe.status,
    url,
    httpStatus: probe.httpStatus,
    latencyMs: probe.latencyMs,
    message: probe.message,
  };
}
