import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { apiClient } from "@/lib/api-client";

/**
 * Motor de automação por GRUPO: cada grupo de um canal possui sua própria
 * configuração independente (janela, intervalo, lojas, loop, status, fila).
 */

const VALID_STORES = new Set(["shopee", "mercadolivre", "magalu", "amazon"]);

export interface AutomationConfigDTO {
  id: string;
  channelId: string;
  groupId: string | null;
  groupName: string | null;
  horaInicio: string;
  horaFim: string;
  intervaloMin: number;
  lojasAtivas: string[];
  postLoop: boolean;
  status: "idle" | "running" | "waiting" | "error" | "done";
  currentIndex: number;
  nextRunAt: string | null;
  lastError: string | null;
  lastSentAt: string | null;
  lastProductName: string | null;
  queueSize: number;
  currentProduct: { title: string; store: string } | null;
}

function normalizeTime(v: unknown, fallback: string): string {
  const s = String(v ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return fallback;
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
}

function normalizeStores(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<string>();
  for (const x of v) {
    const s = String(x ?? "").trim().toLowerCase();
    if (VALID_STORES.has(s)) out.add(s);
  }
  return Array.from(out);
}

function normalizeGroupId(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
}

async function buildStatus(supabase: any, row: any): Promise<AutomationConfigDTO> {
  const { count } = await supabase
    .from("automation_queue")
    .select("id", { count: "exact", head: true })
    .eq("config_id", row.id);
  let current: { title: string; store: string } | null = null;
  if (count && count > 0) {
    const idx = row.current_index % count;
    const { data: c } = await supabase
      .from("automation_queue")
      .select("title, store")
      .eq("config_id", row.id)
      .eq("order_index", idx)
      .maybeSingle();
    if (c) current = { title: c.title, store: c.store };
  }
  return {
    id: row.id,
    channelId: row.channel_id,
    groupId: row.group_id ?? null,
    groupName: row.group_name ?? null,
    horaInicio: String(row.hora_inicio).slice(0, 5),
    horaFim: String(row.hora_fim).slice(0, 5),
    intervaloMin: row.intervalo_min,
    lojasAtivas: row.lojas_ativas ?? [],
    postLoop: !!row.post_loop,
    status: row.status,
    currentIndex: row.current_index,
    nextRunAt: row.next_run_at,
    lastError: row.last_error,
    lastSentAt: row.last_sent_at,
    lastProductName: row.last_product_name,
    queueSize: count ?? 0,
    currentProduct: current,
  };
}

/**
 * Busca a config EXATA para (user_id, channel_id, group_id). Se groupId for
 * null, busca a config "channel-wide" (sem grupo). Nunca reaproveita a config
 * de outro grupo.
 */
async function ensureConfig(
  supabase: any,
  userId: string,
  channelId: string,
  groupId: string | null,
  groupName: string | null,
) {
  const { data: row, error } = await supabase
    .from("automation_configs")
    .upsert({
      user_id: userId,
      channel_id: channelId,
      group_id: groupId,
      group_name: groupName,
    }, { onConflict: "user_id,channel_id,group_scope" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return row;
}

interface ScopeInput {
  channelId: string;
  groupId?: string | null;
  groupName?: string | null;
}

function parseScope(data: ScopeInput) {
  const channelId = String(data?.channelId ?? "").trim();
  if (!channelId) throw new Error("channelId obrigatório");
  return {
    channelId,
    groupId: normalizeGroupId(data?.groupId),
    groupName: (data?.groupName ?? null) as string | null,
  };
}

export const getAutomationConfig = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: ScopeInput) => parseScope(data))
  .handler(async ({ data, context }): Promise<AutomationConfigDTO> => {
    const { supabase, userId } = context;
    const row = await ensureConfig(supabase, userId, data.channelId, data.groupId, data.groupName);
    return buildStatus(supabase, row);
  });

export const saveAutomationConfig = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: ScopeInput & {
    horaInicio: string;
    horaFim: string;
    intervaloMin: number;
    lojasAtivas: string[];
    postLoop: boolean;
  }) => {
    const scope = parseScope(data);
    const intervalo = Math.max(1, Math.min(1440, Number(data?.intervaloMin ?? 15) || 15));
    return {
      ...scope,
      horaInicio: normalizeTime(data?.horaInicio, "07:00:00"),
      horaFim: normalizeTime(data?.horaFim, "22:00:00"),
      intervaloMin: intervalo,
      lojasAtivas: normalizeStores(data?.lojasAtivas),
      postLoop: !!data?.postLoop,
    };
  })
  .handler(async ({ data, context }): Promise<AutomationConfigDTO> => {
    const { supabase, userId } = context;
    const cfg = await ensureConfig(supabase, userId, data.channelId, data.groupId, data.groupName);
    const { data: upd, error } = await supabase
      .from("automation_configs")
      .update({
        hora_inicio: data.horaInicio,
        hora_fim: data.horaFim,
        intervalo_min: data.intervaloMin,
        lojas_ativas: data.lojasAtivas,
        post_loop: data.postLoop,
      })
      .eq("id", cfg.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return buildStatus(supabase, upd);
  });

export const startAutomation = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: ScopeInput) => parseScope(data))
  .handler(async ({ data, context }): Promise<AutomationConfigDTO> => {
    const { supabase, userId } = context;
    const cfg = await ensureConfig(supabase, userId, data.channelId, data.groupId, data.groupName);

    const { count } = await supabase
      .from("automation_queue")
      .select("id", { count: "exact", head: true })
      .eq("config_id", cfg.id);
    if (!count || count === 0) {
      throw new Error("Adicione ao menos um produto à fila deste grupo antes de iniciar");
    }

    const { data: upd, error } = await supabase
      .from("automation_configs")
      .update({
        status: "running",
        current_index: 0,
        next_run_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", cfg.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return buildStatus(supabase, upd);
  });


export const stopAutomation = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: ScopeInput) => parseScope(data))
  .handler(async ({ data, context }): Promise<AutomationConfigDTO> => {
    const { supabase, userId } = context;
    const cfg = await ensureConfig(supabase, userId, data.channelId, data.groupId, data.groupName);
    const { data: upd, error } = await supabase
      .from("automation_configs")
      .update({ status: "idle", next_run_at: null })
      .eq("id", cfg.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return buildStatus(supabase, upd);
  });

export interface CampaignHistoryDTO {
  id: string;
  productName: string | null;
  store: string | null;
  groupName: string | null;
  status: "sent" | "failed";
  sentAt: string;
  errorMessage: string | null;
}

export const listCampaignHistory = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: ScopeInput & { limit?: number }) => ({
    ...parseScope(data),
    limit: Math.min(50, Math.max(1, Number(data?.limit ?? 10) || 10)),
  }))
  .handler(async ({ data, context }): Promise<CampaignHistoryDTO[]> => {
    const { supabase, userId } = context;
    let q = supabase
      .from("whatsapp_campaign_history")
      .select("id, product_name, store, group_name, status, sent_at, error_message, config_id")
      .eq("user_id", userId)
      .order("sent_at", { ascending: false })
      .limit(data.limit);
    if (data.channelId) {
      let cfgQ = supabase
        .from("automation_configs")
        .select("id")
        .eq("user_id", userId)
        .eq("channel_id", data.channelId);
      cfgQ = data.groupId === null ? cfgQ.is("group_id", null) : cfgQ.eq("group_id", data.groupId);
      const { data: cfg } = await cfgQ.maybeSingle();
      if (cfg) q = q.eq("config_id", cfg.id);
      else return [];
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      productName: r.product_name,
      store: r.store,
      groupName: r.group_name,
      status: r.status,
      sentAt: r.sent_at,
      errorMessage: r.error_message,
    }));
  });

const DEFAULT_INSTANCE = "DIVULGA LINKS";

export interface AutomationGroupDTO {
  groupId: string;
  groupName: string | null;
}

/**
 * Lista os grupos disponíveis para automação no canal (grupos selecionados
 * na instância padrão DIVULGA LINKS). Cada grupo é editado independentemente.
 */
export const listAutomationGroups = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { channelId: string }) => {
    const channelId = String(data?.channelId ?? "").trim();
    if (!channelId) throw new Error("channelId obrigatório");
    return { channelId };
  })
  .handler(async ({ data, context }): Promise<AutomationGroupDTO[]> => {
    const { supabase, userId } = context;
    const { data: inst } = await supabase
      .from("whatsapp_instances")
      .select("id")
      .eq("user_id", userId)
      .eq("instance_name", DEFAULT_INSTANCE)
      .maybeSingle();
    if (!inst) return [];
    const { data: sel, error } = await supabase
      .from("whatsapp_group_selections")
      .select("group_jid, group_name")
      .eq("user_id", userId)
      .eq("instance_id", inst.id)
      .eq("channel_id", data.channelId)
      .order("group_name", { ascending: true });
    if (error) throw new Error(error.message);
    return (sel ?? []).map((r: any) => ({
      groupId: r.group_jid,
      groupName: r.group_name ?? null,
    }));
  });

