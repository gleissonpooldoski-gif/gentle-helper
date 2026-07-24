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