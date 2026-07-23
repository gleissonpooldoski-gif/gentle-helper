import { createServerFn } from "@tanstack/react-start";
import { createHash, randomBytes } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { apiClient } from "@/lib/api-client";

export type WhatsAppConnectionStatus = "disconnected" | "pending" | "connected";

export interface WhatsAppConnectionDTO {
  channelId: string;
  status: WhatsAppConnectionStatus;
  connectedAt: string | null;
  lastSeenAt: string | null;
  hasToken: boolean;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateToken(): string {
  return `dvl_wa_${randomBytes(18).toString("hex")}`;
}

export const getWhatsAppConnection = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { channelId: string }) => {
    if (!data?.channelId) throw new Error("channelId é obrigatório");
    return { channelId: String(data.channelId) };
  })
  .handler(async ({ data, context }): Promise<WhatsAppConnectionDTO | null> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("channel_whatsapp_connections")
      .select("channel_id,status,connected_at,last_seen_at,token_hash")
      .eq("user_id", userId)
      .eq("channel_id", data.channelId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return {
      channelId: row.channel_id,
      status: row.status as WhatsAppConnectionStatus,
      connectedAt: row.connected_at,
      lastSeenAt: row.last_seen_at,
      hasToken: Boolean(row.token_hash),
    };
  });

export const generateWhatsAppToken = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { channelId: string }) => {
    if (!data?.channelId) throw new Error("channelId é obrigatório");
    return { channelId: String(data.channelId) };
  })
  .handler(async ({ data, context }): Promise<{ token: string; connection: WhatsAppConnectionDTO }> => {
    const { supabase, userId } = context;
    const token = generateToken();
    const token_hash = hashToken(token);
    const { data: row, error } = await supabase
      .from("channel_whatsapp_connections")
      .upsert(
        {
          user_id: userId,
          channel_id: data.channelId,
          token_hash,
          status: "pending",
          connected_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,channel_id" },
      )
      .select("channel_id,status,connected_at,last_seen_at,token_hash")
      .single();
    if (error) throw new Error(error.message);
    return {
      token,
      connection: {
        channelId: row.channel_id,
        status: row.status as WhatsAppConnectionStatus,
        connectedAt: row.connected_at,
        lastSeenAt: row.last_seen_at,
        hasToken: Boolean(row.token_hash),
      },
    };
  });

export const reconnectWhatsApp = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { channelId: string }) => {
    if (!data?.channelId) throw new Error("channelId é obrigatório");
    return { channelId: String(data.channelId) };
  })
  .handler(async ({ data, context }): Promise<WhatsAppConnectionDTO> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("channel_whatsapp_connections")
      .upsert(
        {
          user_id: userId,
          channel_id: data.channelId,
          status: "pending",
          connected_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,channel_id" },
      )
      .select("channel_id,status,connected_at,last_seen_at,token_hash")
      .single();
    if (error) throw new Error(error.message);
    return {
      channelId: row.channel_id,
      status: row.status as WhatsAppConnectionStatus,
      connectedAt: row.connected_at,
      lastSeenAt: row.last_seen_at,
      hasToken: Boolean(row.token_hash),
    };
  });
