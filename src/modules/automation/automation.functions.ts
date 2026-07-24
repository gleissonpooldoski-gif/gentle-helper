import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { apiClient } from "@/lib/api-client";

/**
 * Motor de automação: agenda envios respeitando janela de horário, intervalo,
 * lojas ativas, ordem dos produtos e modo loop.
 */

const VALID_STORES = new Set(["shopee", "mercadolivre", "magalu", "amazon"]);

export interface AutomationConfigDTO {
  id: string;
  channelId: string;
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

async function ensureConfig(supabase: any, userId: string, channelId: string) {
  const { data: row } = await supabase
    .from("automation_configs")
    .select("*")
    .eq("user_id", userId)
    .eq("channel_id", channelId)
    .maybeSingle();
  if (row) return row;
  const { data: ins, error } = await supabase
    .from("automation_configs")
    .insert({ user_id: userId, channel_id: channelId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return ins;
}

export const getAutomationConfig = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { channelId: string }) => {
    const channelId = String(data?.channelId ?? "").trim();
    if (!channelId) throw new Error("channelId obrigatório");
    return { channelId };
  })
  .handler(async ({ data, context }): Promise<AutomationConfigDTO> => {
    const { supabase, userId } = context;
    const row = await ensureConfig(supabase, userId, data.channelId);
    return buildStatus(supabase, row);
  });

export const saveAutomationConfig = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: {
    channelId: string;
    horaInicio: string;
    horaFim: string;
    intervaloMin: number;
    lojasAtivas: string[];
    postLoop: boolean;
  }) => {
    const channelId = String(data?.channelId ?? "").trim();
    if (!channelId) throw new Error("channelId obrigatório");
    const intervalo = Math.max(1, Math.min(1440, Number(data?.intervaloMin ?? 15) || 15));
    return {
      channelId,
      horaInicio: normalizeTime(data?.horaInicio, "07:00:00"),
      horaFim: normalizeTime(data?.horaFim, "22:00:00"),
      intervaloMin: intervalo,
      lojasAtivas: normalizeStores(data?.lojasAtivas),
      postLoop: !!data?.postLoop,
    };
  })
  .handler(async ({ data, context }): Promise<AutomationConfigDTO> => {
    const { supabase, userId } = context;
    await ensureConfig(supabase, userId, data.channelId);
    const { data: upd, error } = await supabase
      .from("automation_configs")
      .update({
        hora_inicio: data.horaInicio,
        hora_fim: data.horaFim,
        intervalo_min: data.intervaloMin,
        lojas_ativas: data.lojasAtivas,
        post_loop: data.postLoop,
      })
      .eq("user_id", userId)
      .eq("channel_id", data.channelId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return buildStatus(supabase, upd);
  });

export const startAutomation = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { channelId: string }) => {
    const channelId = String(data?.channelId ?? "").trim();
    if (!channelId) throw new Error("channelId obrigatório");
    return { channelId };
  })
  .handler(async ({ data, context }): Promise<AutomationConfigDTO> => {
    const { supabase, userId } = context;
    const cfg = await ensureConfig(supabase, userId, data.channelId);

    const lojas: string[] = cfg.lojas_ativas ?? [];
    if (lojas.length === 0) throw new Error("Selecione ao menos uma loja ativa");

    // Snapshot dos produtos das lojas ativas
    const { data: prods, error: pErr } = await supabase
      .from("products")
      .select("id, title, platform, image_url, affiliate_link, created_at")
      .eq("user_id", userId)
      .in("platform", lojas)
      .order("created_at", { ascending: true });
    if (pErr) throw new Error(pErr.message);
    const list = (prods ?? []).filter((p: any) => p.affiliate_link);
    if (list.length === 0) throw new Error("Nenhum produto encontrado nas lojas ativas");

    await supabase.from("automation_queue").delete().eq("config_id", cfg.id);

    const rows = list.map((p: any, i: number) => ({
      config_id: cfg.id,
      user_id: userId,
      order_index: i,
      product_id: p.id,
      store: p.platform,
      title: p.title,
      media_url: p.image_url,
      link: p.affiliate_link,
    }));
    // Insere em batches para evitar payload muito grande
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabase.from("automation_queue").insert(chunk);
      if (error) throw new Error(error.message);
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
  .inputValidator((data: { channelId: string }) => {
    const channelId = String(data?.channelId ?? "").trim();
    if (!channelId) throw new Error("channelId obrigatório");
    return { channelId };
  })
  .handler(async ({ data, context }): Promise<AutomationConfigDTO> => {
    const { supabase, userId } = context;
    const cfg = await ensureConfig(supabase, userId, data.channelId);
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
  .inputValidator((data: { channelId: string; limit?: number }) => ({
    channelId: String(data?.channelId ?? "").trim(),
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
      const { data: cfg } = await supabase
        .from("automation_configs")
        .select("id")
        .eq("user_id", userId)
        .eq("channel_id", data.channelId)
        .maybeSingle();
      if (cfg) q = q.eq("config_id", cfg.id);
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
