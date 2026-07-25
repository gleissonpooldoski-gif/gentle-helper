import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { apiClient } from "@/lib/api-client";

/**
 * Motor de automação por GRUPO. A fonte de produtos é a planilha importada
 * (tabela `products`). Cada grupo tem uma config independente com janela,
 * intervalo, loop e lojas ativas. O sistema escolhe automaticamente
 * qualquer produto disponível e usa `automation_group_sends` para garantir
 * que um produto não se repita antes que todos os disponíveis (filtrados
 * pelas lojas ativas) tenham sido publicados naquele grupo.
 */

const VALID_STORES = new Set(["shopee", "mercadolivre", "magalu", "amazon"]);

export interface AutomationConfigDTO {
  id: string;
  channelId: string;
  groupId: string | null;
  groupName: string | null;
  instanceId: string | null;
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

async function countAvailableProducts(
  supabase: any,
  userId: string,
  channelId: string | null,
  lojas: string[],
): Promise<number> {
  if (!channelId) return 0;
  if (!lojas || lojas.length === 0) return 0;
  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("channel_id", channelId)
    .in("platform", lojas)
    .eq("availability", "active")
    .not("affiliate_link", "is", null);
  return count ?? 0;
}

async function countRemainingForConfig(
  supabase: any,
  configId: string,
  totalActive: number,
): Promise<number> {
  if (totalActive <= 0) return 0;
  const { count } = await supabase
    .from("automation_group_sends")
    .select("product_id", { count: "exact", head: true })
    .eq("config_id", configId);
  const sent = count ?? 0;
  return Math.max(0, totalActive - sent);
}

function projectNextRunAt(row: any): string | null {
  // Se o worker já agendou um próximo disparo, usa-o.
  if (row?.next_run_at) return row.next_run_at;
  // Caso contrário, projeta a partir do último envio + intervalo,
  // desde que a automação esteja ativa (running/waiting).
  const active = row?.status === "running" || row?.status === "waiting";
  if (!active) return null;
  const interval = Number(row?.intervalo_min) || 0;
  if (!interval) return null;
  const base = row?.last_sent_at ? new Date(row.last_sent_at).getTime() : Date.now();
  return new Date(base + interval * 60_000).toISOString();
}

async function buildStatus(supabase: any, row: any): Promise<AutomationConfigDTO> {
  const totalActive = await countAvailableProducts(
    supabase,
    row.user_id,
    row.channel_id,
    row.lojas_ativas ?? [],
  );
  // "Produtos disponíveis" = ativos deste grupo ainda não enviados no ciclo atual.
  // No modo Loop, o worker limpa automation_group_sends ao fechar o ciclo, então
  // o número volta ao total automaticamente. No modo sem Loop, decresce até zero
  // e a automação encerra ('done'). Em ambos os modos o valor reflete a realidade.
  const remaining = await countRemainingForConfig(supabase, row.id, totalActive);

  return {
    id: row.id,
    channelId: row.channel_id,
    groupId: row.group_id ?? null,
    groupName: row.group_name ?? null,
    instanceId: row.instance_id ?? null,
    horaInicio: String(row.hora_inicio).slice(0, 5),
    horaFim: String(row.hora_fim).slice(0, 5),
    intervaloMin: row.intervalo_min,
    lojasAtivas: row.lojas_ativas ?? [],
    postLoop: !!row.post_loop,
    status: row.status,
    currentIndex: row.current_index,
    nextRunAt: projectNextRunAt(row),
    lastError: row.last_error,
    lastSentAt: row.last_sent_at,
    lastProductName: row.last_product_name,
    queueSize: remaining,
    currentProduct: row.last_product_name
      ? { title: row.last_product_name, store: "" }
      : null,
  };
}

async function ensureConfig(
  supabase: any,
  userId: string,
  channelId: string,
  groupId: string | null,
  groupName: string | null,
  seedInstanceId: string | null = null,
) {
  // Cada grupo tem sua PRÓPRIA config (frequência, janela, loop, lojas,
  // instância). Se houver `seedInstanceId`, ele é gravado apenas na criação —
  // nunca sobrescreve uma escolha já feita pelo usuário.
  const { data: existing } = await supabase
    .from("automation_configs")
    .select("*")
    .eq("user_id", userId)
    .eq("channel_id", channelId)
    .eq("group_scope", groupId ?? "")
    .maybeSingle();
  if (existing) return existing;

  const { data: row, error } = await supabase
    .from("automation_configs")
    .insert({
      user_id: userId,
      channel_id: channelId,
      group_id: groupId,
      group_name: groupName,
      instance_id: seedInstanceId,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return row;
}


interface ScopeInput {
  channelId: string;
  groupId?: string | null;
  groupName?: string | null;
  instanceId?: string | null;
}

function parseScope(data: ScopeInput) {
  const channelId = String(data?.channelId ?? "").trim();
  if (!channelId) throw new Error("channelId obrigatório");
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const seedInst = data?.instanceId ? String(data.instanceId).trim() : "";
  return {
    channelId,
    groupId: normalizeGroupId(data?.groupId),
    groupName: (data?.groupName ?? null) as string | null,
    seedInstanceId: UUID_RE.test(seedInst) ? seedInst : null,
  };
}

export const getAutomationConfig = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: ScopeInput) => parseScope(data))
  .handler(async ({ data, context }): Promise<AutomationConfigDTO> => {
    const { supabase, userId } = context;
    const row = await ensureConfig(supabase, userId, data.channelId, data.groupId, data.groupName, data.seedInstanceId);
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
    instanceId?: string | null;
  }) => {
    const scope = parseScope(data);
    const intervalo = Math.max(1, Math.min(1440, Number(data?.intervaloMin ?? 15) || 15));
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const instId = data?.instanceId ? String(data.instanceId).trim() : "";
    return {
      ...scope,
      horaInicio: normalizeTime(data?.horaInicio, "07:00:00"),
      horaFim: normalizeTime(data?.horaFim, "22:00:00"),
      intervaloMin: intervalo,
      lojasAtivas: normalizeStores(data?.lojasAtivas),
      postLoop: !!data?.postLoop,
      instanceId: UUID_RE.test(instId) ? instId : null,
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
        instance_id: data.instanceId,
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

    const total = await countAvailableProducts(supabase, userId, data.channelId, cfg.lojas_ativas ?? []);
    if (total === 0) {
      throw new Error(
        "Nenhum produto disponível nas lojas selecionadas. Importe produtos ou ajuste o filtro de lojas.",
      );
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
      // Cada grupo tem sua própria config; o histórico é filtrado pela
      // config específica (canal + grupo) para não misturar disparos.
      let cfgQ = supabase
        .from("automation_configs")
        .select("id")
        .eq("user_id", userId)
        .eq("channel_id", data.channelId);
      cfgQ = data.groupId ? cfgQ.eq("group_id", data.groupId) : cfgQ.is("group_id", null);
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



export interface AutomationGroupDTO {
  groupId: string;
  groupName: string | null;
  instanceId: string;
  instanceName: string;
  instancePhone: string | null;
  instanceStatus: string | null;
  configId: string | null;
  automationStatus: "idle" | "running" | "waiting" | "error" | "done" | "paused" | null;
  productCount: number;
  productTotal: number;
  lastSentAt: string | null;
  intervalMin: number;
  postsPerHour: number;
}


/**
 * Lista TODOS os grupos que o usuário selecionou em QUALQUER instância
 * WhatsApp para este canal. Cada item é uma "unidade" (1 WhatsApp × 1
 * grupo) totalmente isolada — com contagem de produtos vinculados, último
 * envio e status de automação individuais.
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
    const { data: insts } = await supabase
      .from("whatsapp_instances")
      .select("id, instance_name, phone, status")
      .eq("user_id", userId);
    const instMap = new Map<string, any>();
    for (const i of insts ?? []) instMap.set(i.id, i);
    if (instMap.size === 0) return [];

    const { data: sel, error } = await supabase
      .from("whatsapp_group_selections")
      .select("group_jid, group_name, instance_id, updated_at")
      .eq("user_id", userId)
      .eq("channel_id", data.channelId)
      .in("instance_id", Array.from(instMap.keys()))
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);

    const seen = new Set<string>();
    const unique: any[] = [];
    for (const r of (sel ?? []) as any[]) {
      if (seen.has(r.group_jid)) continue;
      seen.add(r.group_jid);
      unique.push(r);
    }
    unique.sort((a, b) =>
      String(a.group_name ?? "").localeCompare(String(b.group_name ?? ""), "pt-BR"),
    );

    const jids = unique.map((r) => r.group_jid);
    const { data: cfgs } = jids.length
      ? await supabase
          .from("automation_configs")
          .select("id, group_id, status, last_sent_at, instance_id, intervalo_min")
          .eq("user_id", userId)
          .eq("channel_id", data.channelId)
          .in("group_id", jids)
      : { data: [] as any[] };
    const cfgMap = new Map<string, any>();
    for (const c of (cfgs ?? []) as any[]) if (c.group_id) cfgMap.set(c.group_id, c);

    // Contagem real de produtos vinculados ao grupo (ativos e total).
    // NÃO filtramos por channel_id: a captura via webhook grava o produto
    // com o channel do canal que MONITORA o grupo, que nem sempre é o
    // canal atualmente aberto. A chave real de vínculo é source_group_jid.
    const countMap = new Map<string, { active: number; total: number }>();
    await Promise.all(
      jids.map(async (jid) => {
        const [{ count: active }, { count: total }] = await Promise.all([
          supabase
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("source_group_jid", jid)
            .eq("availability", "active"),
          supabase
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("source_group_jid", jid),
        ]);
        countMap.set(jid, { active: active ?? 0, total: total ?? 0 });
      }),
    );


    // Último envio real por (instância, grupo) via histórico de campanhas
    const lastSentMap = new Map<string, string>();
    if (jids.length) {
      const { data: hist } = await supabase
        .from("whatsapp_campaign_history")
        .select("group_id, sent_at, config_id")
        .eq("user_id", userId)
        .eq("status", "sent")
        .in("group_id", jids)
        .order("sent_at", { ascending: false })
        .limit(500);
      for (const h of (hist ?? []) as any[]) {
        if (!h.group_id) continue;
        if (!lastSentMap.has(h.group_id)) lastSentMap.set(h.group_id, h.sent_at);
      }
    }

    return unique.map((r: any) => {
      const inst = instMap.get(r.instance_id);
      const cfg = cfgMap.get(r.group_jid);
      const counts = countMap.get(r.group_jid) ?? { active: 0, total: 0 };
      const lastSent = lastSentMap.get(r.group_jid) ?? cfg?.last_sent_at ?? null;
      return {
        groupId: r.group_jid,
        groupName: r.group_name ?? null,
        instanceId: r.instance_id,
        instanceName: inst?.instance_name ?? "—",
        instancePhone: inst?.phone ?? null,
        instanceStatus: inst?.status ?? null,
        configId: cfg?.id ?? null,
        automationStatus: (cfg?.status ?? null) as AutomationGroupDTO["automationStatus"],
        productCount: counts.active,
        productTotal: counts.total,
        lastSentAt: lastSent,
      };
    });
  });


export interface GroupProductDTO {
  id: string;
  title: string;
  platform: string;
  promoPrice: number | null;
  imageUrl: string | null;
  availability: string;
}

export const listGroupProducts = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { channelId: string; groupJid: string }) => ({
    channelId: String(data?.channelId ?? "").trim(),
    groupJid: String(data?.groupJid ?? "").trim(),
  }))
  .handler(async ({ data, context }): Promise<GroupProductDTO[]> => {
    const { supabase, userId } = context;
    if (!data.groupJid) return [];
    const { data: rows, error } = await supabase
      .from("products")
      .select("id, title, platform, promo_price, image_url, availability")
      .eq("user_id", userId)
      .eq("source_group_jid", data.groupJid)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    return (rows ?? []).map((r: any) => ({
      id: r.id,
      title: r.title,
      platform: r.platform,
      promoPrice: r.promo_price != null ? Number(r.promo_price) : null,
      imageUrl: r.image_url,
      availability: r.availability,
    }));
  });

export const toggleGroupAutomation = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { channelId: string; groupId: string; pause: boolean }) => ({
    channelId: String(data?.channelId ?? "").trim(),
    groupId: String(data?.groupId ?? "").trim(),
    pause: !!data?.pause,
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.channelId || !data.groupId) throw new Error("parâmetros inválidos");
    const { data: cfg } = await supabase
      .from("automation_configs")
      .select("id, status")
      .eq("user_id", userId)
      .eq("channel_id", data.channelId)
      .eq("group_id", data.groupId)
      .maybeSingle();
    if (!cfg) throw new Error("Configure este grupo antes de pausar/retomar.");
    const nextStatus = data.pause ? "idle" : "running";
    const patch: any = { status: nextStatus };
    if (data.pause) patch.next_run_at = null;
    else patch.next_run_at = new Date().toISOString();
    const { error } = await supabase
      .from("automation_configs")
      .update(patch)
      .eq("id", cfg.id);
    if (error) throw new Error(error.message);
    return { status: nextStatus };
  });


export interface ChannelFlowSummaryDTO {
  activeProducts: number;
  intervalMin: number;
  postsPerHour: number;
  antiRepetitionHours: number;
  healthy: boolean;
  idealApprox: number;
}

/**
 * Dados reais para a seção "Fluxo saudável de publicações":
 * - `activeProducts`: total de produtos do usuário com availability='active'
 *   (todas as plataformas; atualiza sozinho quando validação marca inativo).
 * - `intervalMin`: menor intervalo configurado entre os grupos do canal
 *   (fallback 15 min quando não há config).
 * - `postsPerHour`: 60 ÷ intervalMin.
 * - `antiRepetitionHours`: janela real usada pelo motor de publicação.
 */
export const getChannelFlowSummary = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { channelId: string }) => {
    const channelId = String(data?.channelId ?? "").trim();
    if (!channelId) throw new Error("channelId obrigatório");
    return { channelId };
  })
  .handler(async ({ data, context }): Promise<ChannelFlowSummaryDTO> => {
    const { supabase, userId } = context;
    const { count: active } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("channel_id", data.channelId)
      .eq("availability", "active")
      .not("affiliate_link", "is", null);


    const { data: cfgs } = await supabase
      .from("automation_configs")
      .select("intervalo_min")
      .eq("user_id", userId)
      .eq("channel_id", data.channelId);
    const intervals = (cfgs ?? [])
      .map((c: any) => Number(c.intervalo_min))
      .filter((n: number) => Number.isFinite(n) && n > 0);
    const intervalMin = intervals.length > 0 ? Math.min(...intervals) : 15;
    const postsPerHour = Math.max(1, Math.round(60 / intervalMin));
    const activeProducts = active ?? 0;

    return {
      activeProducts,
      intervalMin,
      postsPerHour,
      antiRepetitionHours: 24,
      healthy: activeProducts > 0,
      idealApprox: 300,
    };
  });

