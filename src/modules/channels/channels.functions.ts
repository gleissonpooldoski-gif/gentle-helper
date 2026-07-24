import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { apiClient } from "@/lib/api-client";

export interface ChannelDTO {
  id: string;
  name: string;
  externalId: string | null;
  autoPost: boolean;
  intervalMin: number;
  randomOrder: boolean;
}

function mapChannel(row: any): ChannelDTO {
  return {
    id: row.id,
    name: row.name,
    externalId: row.external_id ?? null,
    autoPost: !!row.auto_post,
    intervalMin: row.interval_min,
    randomOrder: !!row.random_order,
  };
}

function parseChannelId(value: unknown): string {
  const id = String(value ?? "").trim();
  if (!id) throw new Error("ID do canal é obrigatório");
  return id;
}

export const listChannels = createServerFn({ method: "GET" })
  .middleware([apiClient, requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChannelDTO[]> => {
    const { data, error } = await context.supabase
      .from("channels")
      .select("id, name, external_id, auto_post, interval_min, random_order")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapChannel);
  });

export const getChannel = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { channelId: string }) => ({ channelId: parseChannelId(data?.channelId) }))
  .handler(async ({ data, context }): Promise<ChannelDTO> => {
    const { data: row, error } = await context.supabase
      .from("channels")
      .select("id, name, external_id, auto_post, interval_min, random_order")
      .eq("user_id", context.userId)
      .eq("id", data.channelId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Canal não encontrado");
    return mapChannel(row);
  });

export const updateChannel = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { channelId: string; autoPost: boolean }) => ({
    channelId: parseChannelId(data?.channelId),
    autoPost: !!data?.autoPost,
  }))
  .handler(async ({ data, context }): Promise<ChannelDTO> => {
    const { data: row, error } = await context.supabase
      .from("channels")
      .update({ auto_post: data.autoPost })
      .eq("user_id", context.userId)
      .eq("id", data.channelId)
      .select("id, name, external_id, auto_post, interval_min, random_order")
      .single();
    if (error) throw new Error(error.message);
    return mapChannel(row);
  });

export interface ChannelDashboardDTO extends ChannelDTO {
  productsTotal: number;
  productsByPlatform: { platform: string; count: number }[];
  sentLast30d: number;
  sentByPlatformLast30d: { platform: string; count: number }[];
  socials: {
    telegram: "connected" | "disconnected" | "disabled";
    whatsapp: "connected" | "disconnected" | "disabled";
    instagram: "connected" | "disconnected" | "disabled";
    storyAuto: "connected" | "disconnected" | "disabled";
  };
  automationActive: boolean;
}

const PLATFORM_LABEL: Record<string, string> = {
  shopee: "Shopee",
  mercadolivre: "Mercado Livre",
  magalu: "Magalu",
  amazon: "Amazon",
};

function labelPlatform(p: string): string {
  return PLATFORM_LABEL[p] ?? (p ? p.charAt(0).toUpperCase() + p.slice(1) : "Outros");
}

export const listChannelDashboards = createServerFn({ method: "GET" })
  .middleware([apiClient, requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChannelDashboardDTO[]> => {
    const { supabase, userId } = context;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [channelsRes, productsRes, instancesRes, configsRes, historyRes] = await Promise.all([
      supabase
        .from("channels")
        .select("id, name, external_id, auto_post, interval_min, random_order")
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
      supabase.from("products").select("platform").eq("user_id", userId),
      supabase.from("whatsapp_instances").select("channel_id, status").eq("user_id", userId),
      supabase
        .from("automation_configs")
        .select("channel_id, status")
        .eq("user_id", userId),
      supabase
        .from("whatsapp_campaign_history")
        .select("config_id, store, sent_at")
        .eq("user_id", userId)
        .gte("sent_at", since),
    ]);

    if (channelsRes.error) throw new Error(channelsRes.error.message);

    // Total per-platform product counts are shared per user (products table is not scoped by channel).
    const productsByPlatformMap = new Map<string, number>();
    for (const row of (productsRes.data ?? []) as { platform: string | null }[]) {
      const p = (row.platform ?? "outros").toLowerCase();
      productsByPlatformMap.set(p, (productsByPlatformMap.get(p) ?? 0) + 1);
    }
    const productsByPlatform = Array.from(productsByPlatformMap.entries()).map(([platform, count]) => ({
      platform: labelPlatform(platform),
      count,
    }));
    const productsTotal = (productsRes.data ?? []).length;

    // WhatsApp per channel: connected when any instance for that channel is in 'open' state.
    const waByChannel = new Map<string, boolean>();
    for (const inst of (instancesRes.data ?? []) as { channel_id: string | null; status: string | null }[]) {
      if (!inst.channel_id) continue;
      const connected = (inst.status ?? "").toLowerCase() === "open";
      waByChannel.set(inst.channel_id, connected || (waByChannel.get(inst.channel_id) ?? false));
    }

    // Automation active: any config for channel with status='active'.
    const automationByChannel = new Map<string, boolean>();
    const configIdsByChannel = new Map<string, string[]>();
    for (const cfg of (configsRes.data ?? []) as any[]) {
      if (!cfg.channel_id) continue;
      const active = String(cfg.status ?? "").toLowerCase() === "active";
      automationByChannel.set(cfg.channel_id, active || (automationByChannel.get(cfg.channel_id) ?? false));
      const arr = configIdsByChannel.get(cfg.channel_id) ?? [];
      if (cfg.id) arr.push(cfg.id);
      configIdsByChannel.set(cfg.channel_id, arr);
    }
    // Re-fetch config ids (previous select omitted id) — cheaper: request again with id included.
    const configsWithIds = await supabase
      .from("automation_configs")
      .select("id, channel_id")
      .eq("user_id", userId);
    const channelByConfigId = new Map<string, string>();
    for (const c of (configsWithIds.data ?? []) as { id: string; channel_id: string | null }[]) {
      if (c.channel_id) channelByConfigId.set(c.id, c.channel_id);
    }

    // 30d sends grouped by channel and by platform (using campaign history's `store` field).
    const sentByChannel = new Map<string, number>();
    const sentByChannelPlatform = new Map<string, Map<string, number>>();
    for (const h of (historyRes.data ?? []) as { config_id: string | null; store: string | null }[]) {
      if (!h.config_id) continue;
      const channelId = channelByConfigId.get(h.config_id);
      if (!channelId) continue;
      sentByChannel.set(channelId, (sentByChannel.get(channelId) ?? 0) + 1);
      const key = (h.store ?? "outros").toLowerCase();
      const inner = sentByChannelPlatform.get(channelId) ?? new Map<string, number>();
      inner.set(key, (inner.get(key) ?? 0) + 1);
      sentByChannelPlatform.set(channelId, inner);
    }

    return (channelsRes.data ?? []).map((row: any) => {
      const base = mapChannel(row);
      const inner = sentByChannelPlatform.get(base.id);
      const sentByPlatformLast30d = inner
        ? Array.from(inner.entries()).map(([platform, count]) => ({
            platform: labelPlatform(platform),
            count,
          }))
        : [];
      return {
        ...base,
        productsTotal,
        productsByPlatform,
        sentLast30d: sentByChannel.get(base.id) ?? 0,
        sentByPlatformLast30d,
        automationActive: base.autoPost || (automationByChannel.get(base.id) ?? false),
        socials: {
          telegram: base.externalId ? "connected" : "disconnected",
          whatsapp: waByChannel.get(base.id) ? "connected" : "disconnected",
          instagram: "disabled",
          storyAuto: "disabled",
        },
      } satisfies ChannelDashboardDTO;
    });
  });