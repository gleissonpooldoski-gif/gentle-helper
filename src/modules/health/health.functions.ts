import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * PAINEL DE SAÚDE DO SISTEMA (Etapa 1 — leitura pura).
 *
 * Nenhuma escrita, nenhuma alteração de fluxo. Só consolida sinais que já
 * existem no banco + um ping com timeout na Evolution API, para que uma parada
 * silenciosa (cron rodando, zero envios) fique visível imediatamente.
 */

export type InstanceHealth = {
  id: string;
  name: string;
  status: string | null;
  lastSeenAt: string | null;
  lastSentAt: string | null;
  minutesIdle: number | null;
  /** conectada, mas sem enviar há muito tempo → suspeita de travamento */
  stalled: boolean;
};

export type TunnelHealth = {
  status: "ONLINE" | "OFFLINE" | "CHANGED" | "ERROR";
  currentUrl: string | null;
  previousUrl: string | null;
  lastCheck: string | null;
  lastChange: string | null;
  errorMessage: string | null;
};

export type SystemHealth = {
  checkedAt: string;
  tunnel: TunnelHealth;
  evolution: { online: boolean; latencyMs: number | null; error: string | null };
  instances: InstanceHealth[];
  automation: {
    running: number;
    waiting: number;
    error: number;
    disabled: number;
    lastSentAt: string | null;
    minutesSinceLastSend: number | null;
  };
  queue: {
    processing: number;
    stuckProcessing: number;
    failedLast24h: number;
    sentLast24h: number;
  };
  failures: { unresolved: number; recent: Array<{ id: string; message: string; createdAt: string }> };
};

const STALLED_MINUTES = 60;
const STUCK_CLAIM_MINUTES = 10;

function minutesSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 60_000);
}

async function pingEvolution(): Promise<SystemHealth["evolution"]> {
  // Fonte única da URL: public.evolution_settings (nunca process.env, que fica
  // desatualizado quando o túnel Cloudflare muda de hostname).
  let base: string;
  let key: string;
  try {
    const { getEvolutionConfig } = await import("@/modules/whatsapp/evolution/client.server");
    const cfg = await getEvolutionConfig();
    base = cfg.baseUrl;
    key = cfg.apiKey;
  } catch (e) {
    return {
      online: false,
      latencyMs: null,
      error: e instanceof Error ? e.message : "Evolution API não configurada",
    };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  const started = Date.now();
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/instance/fetchInstances`, {
      headers: { apikey: key },
      signal: ctrl.signal,
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      const tunnelOffline = [530, 522, 523, 524].includes(res.status);
      return {
        online: false,
        latencyMs,
        error: tunnelOffline
          ? "Tunnel Cloudflare offline. Atualize a URL da Evolution API."
          : `HTTP ${res.status}`,
      };
    }
    return { online: true, latencyMs, error: null };
  } catch (e) {
    return {
      online: false,
      latencyMs: Date.now() - started,
      error: e instanceof Error ? e.message : "Falha de rede",
    };
  } finally {
    clearTimeout(timer);
  }
}

export const getSystemDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SystemHealth> => {
    const db = context.supabase as any;
    const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
    const stuckCutoff = new Date(Date.now() - STUCK_CLAIM_MINUTES * 60_000).toISOString();

    const [
      evolution,
      instancesRes,
      configsRes,
      lastSendRes,
      processingRes,
      stuckRes,
      failed24Res,
      sent24Res,
      failuresRes,
      recentFailuresRes,
    ] = await Promise.all([
      pingEvolution(),
      db.from("whatsapp_instances").select("id, instance_name, status, last_seen_at"),
      db.from("automation_configs").select("status, instance_id, last_sent_at"),
      db
        .from("whatsapp_campaign_history")
        .select("sent_at, instance_name")
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(200),
      db.from("automation_group_sends").select("id", { count: "exact", head: true }).eq("status", "processing"),
      db
        .from("automation_group_sends")
        .select("id", { count: "exact", head: true })
        .eq("status", "processing")
        .lt("sent_at", stuckCutoff),
      db
        .from("automation_group_sends")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("sent_at", since24h),
      db
        .from("automation_group_sends")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("sent_at", since24h),
      db.from("automation_failures").select("id", { count: "exact", head: true }).is("resolved_at", null),
      db
        .from("automation_failures")
        .select("id, error_message, created_at")
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const history = (lastSendRes.data ?? []) as Array<{ sent_at: string; instance_name: string | null }>;
    const lastSentByInstanceName = new Map<string, string>();
    for (const h of history) {
      if (h.instance_name && !lastSentByInstanceName.has(h.instance_name)) {
        lastSentByInstanceName.set(h.instance_name, h.sent_at);
      }
    }

    const configs = (configsRes.data ?? []) as Array<{ status: string; instance_id: string | null; last_sent_at: string | null }>;
    const countBy = (s: string) => configs.filter((c) => c.status === s).length;
    const activeInstanceIds = new Set(configs.filter((c) => c.status === "running").map((c) => c.instance_id));

    const instances: InstanceHealth[] = ((instancesRes.data ?? []) as Array<{
      id: string;
      instance_name: string;
      status: string | null;
      last_seen_at: string | null;
    }>).map((i) => {
      const lastSentAt = lastSentByInstanceName.get(i.instance_name) ?? null;
      const idle = minutesSince(lastSentAt);
      const connected = i.status === "connected" || i.status === "open";
      return {
        id: i.id,
        name: i.instance_name,
        status: i.status,
        lastSeenAt: i.last_seen_at,
        lastSentAt,
        minutesIdle: idle,
        stalled: connected && activeInstanceIds.has(i.id) && (idle === null || idle > STALLED_MINUTES),
      };
    });

    const lastSentAt = history[0]?.sent_at ?? null;

    return {
      checkedAt: new Date().toISOString(),
      evolution,
      instances,
      automation: {
        running: countBy("running"),
        waiting: countBy("waiting"),
        error: countBy("error"),
        disabled: countBy("disabled"),
        lastSentAt,
        minutesSinceLastSend: minutesSince(lastSentAt),
      },
      queue: {
        processing: processingRes.count ?? 0,
        stuckProcessing: stuckRes.count ?? 0,
        failedLast24h: failed24Res.count ?? 0,
        sentLast24h: sent24Res.count ?? 0,
      },
      failures: {
        unresolved: failuresRes.count ?? 0,
        recent: ((recentFailuresRes.data ?? []) as Array<{ id: string; error_message: string; created_at: string }>).map(
          (f) => ({ id: f.id, message: f.error_message, createdAt: f.created_at }),
        ),
      },
    };
  });
