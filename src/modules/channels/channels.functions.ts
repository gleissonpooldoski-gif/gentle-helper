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

const CHANNEL_LIMIT = 5;

export const createChannel = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: {
    name: string;
    externalId?: string | null;
    autoPost?: boolean;
    intervalMin?: number;
    randomOrder?: boolean;
  }) => {
    const name = String(data?.name ?? "").trim();
    if (!name) throw new Error("Nome do grupo é obrigatório");
    if (name.length > 120) throw new Error("Nome muito longo");
    const externalId = data?.externalId ? String(data.externalId).trim().slice(0, 200) : null;
    const intervalMin = Math.max(1, Math.min(1440, Math.floor(Number(data?.intervalMin ?? 30))));
    return {
      name,
      externalId: externalId || null,
      autoPost: !!data?.autoPost,
      intervalMin,
      randomOrder: !!data?.randomOrder,
    };
  })
  .handler(async ({ data, context }): Promise<ChannelDTO> => {
    const { count, error: countErr } = await context.supabase
      .from("channels")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId);
    if (countErr) throw new Error(countErr.message);
    if ((count ?? 0) >= CHANNEL_LIMIT) {
      throw new Error(`Limite de ${CHANNEL_LIMIT} grupos atingido.`);
    }
    const { data: row, error } = await context.supabase
      .from("channels")
      .insert({
        user_id: context.userId,
        name: data.name,
        external_id: data.externalId,
        auto_post: data.autoPost,
        interval_min: data.intervalMin,
        random_order: data.randomOrder,
      } as never)
      .select("id, name, external_id, auto_post, interval_min, random_order")
      .single();
    if (error) throw new Error(error.message);
    return mapChannel(row);
  });

export const deleteChannel = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { channelId: string }) => ({ channelId: parseChannelId(data?.channelId) }))
  .handler(async ({ data, context }): Promise<{ deleted: boolean }> => {
    const { error } = await context.supabase
      .from("channels")
      .delete()
      .eq("user_id", context.userId)
      .eq("id", data.channelId);
    if (error) throw new Error(error.message);
    return { deleted: true };
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
      supabase
        .from("products")
        .select("channel_id, platform, availability, affiliate_link")
        .eq("user_id", userId),
      supabase.from("whatsapp_instances").select("channel_id, status").eq("user_id", userId),
      supabase
        .from("automation_configs")
        .select("id, channel_id, status, lojas_ativas")
        .eq("user_id", userId),
      supabase
        .from("whatsapp_campaign_history")
        .select("config_id, store, sent_at")
        .eq("user_id", userId)
        .gte("sent_at", since),
    ]);

    if (channelsRes.error) throw new Error(channelsRes.error.message);

    // Index products by (channel_id, platform) — strict per-channel isolation.
    const productsByChannelPlatform = new Map<string, Map<string, number>>();
    for (const row of (productsRes.data ?? []) as {
      channel_id: string | null;
      platform: string | null;
      availability: string | null;
      affiliate_link: string | null;
    }[]) {
      if (!row.channel_id) continue;
      if ((row.availability ?? "").toLowerCase() !== "active") continue;
      if (!row.affiliate_link) continue;
      const p = (row.platform ?? "outros").toLowerCase();
      const inner = productsByChannelPlatform.get(row.channel_id) ?? new Map<string, number>();
      inner.set(p, (inner.get(p) ?? 0) + 1);
      productsByChannelPlatform.set(row.channel_id, inner);
    }


    // WhatsApp per channel
    const waByChannel = new Map<string, boolean>();
    for (const inst of (instancesRes.data ?? []) as { channel_id: string | null; status: string | null }[]) {
      if (!inst.channel_id) continue;
      const connected = (inst.status ?? "").toLowerCase() === "open";
      waByChannel.set(inst.channel_id, connected || (waByChannel.get(inst.channel_id) ?? false));
    }

    // Automation per channel: active flag + union of lojas_ativas + config_id map.
    const automationByChannel = new Map<string, boolean>();
    const lojasByChannel = new Map<string, Set<string>>();
    const channelByConfigId = new Map<string, string>();
    for (const cfg of (configsRes.data ?? []) as {
      id: string;
      channel_id: string | null;
      status: string | null;
      lojas_ativas: string[] | null;
    }[]) {
      if (!cfg.channel_id) continue;
      channelByConfigId.set(cfg.id, cfg.channel_id);
      const active = String(cfg.status ?? "").toLowerCase() === "active";
      automationByChannel.set(cfg.channel_id, active || (automationByChannel.get(cfg.channel_id) ?? false));
      const set = lojasByChannel.get(cfg.channel_id) ?? new Set<string>();
      for (const l of cfg.lojas_ativas ?? []) set.add(String(l).toLowerCase());
      lojasByChannel.set(cfg.channel_id, set);
    }

    // 30d sends grouped by channel and by platform (via config_id → channel_id).
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
      const lojas = lojasByChannel.get(base.id) ?? new Set<string>();
      const channelProducts = productsByChannelPlatform.get(base.id) ?? new Map<string, number>();

      // Mostra a quantidade real de produtos existentes no grupo (por plataforma).
      // Se houver `lojas_ativas`, garante que essas plataformas apareçam mesmo com 0.
      const platforms = new Set<string>([...channelProducts.keys(), ...lojas]);
      const productsByPlatform: { platform: string; count: number }[] = [];
      let productsTotal = 0;
      for (const platform of platforms) {
        const count = channelProducts.get(platform) ?? 0;
        productsTotal += count;
        productsByPlatform.push({ platform: labelPlatform(platform), count });
      }



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

export interface ChannelProductCountsDTO {
  shopee: number;
  mercadolivre: number;
}

export const getChannelProductCounts = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { channelId: string }) => ({ channelId: parseChannelId(data?.channelId) }))
  .handler(async ({ data, context }): Promise<ChannelProductCountsDTO> => {
    const base = context.supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("channel_id", data.channelId)
      .eq("availability", "active");
    const [shopee, ml] = await Promise.all([
      base.eq("platform", "shopee"),
      context.supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .eq("channel_id", data.channelId)
        .eq("availability", "active")
        .eq("platform", "mercadolivre"),
    ]);
    if (shopee.error) throw new Error(shopee.error.message);
    if (ml.error) throw new Error(ml.error.message);
    return { shopee: shopee.count ?? 0, mercadolivre: ml.count ?? 0 };
  });