import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { apiClient } from "@/lib/api-client";

export type WhatsAppSessionStatus = "pending" | "connected" | "disconnected";

export interface WhatsAppSessionDTO {
  channelId: string;
  status: WhatsAppSessionStatus;
  phoneNumber: string | null;
  sessionId: string | null;
  connectedAt: string | null;
  lastSeenAt: string | null;
}

export const getWhatsAppSession = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { channelId: string }) => {
    if (!data?.channelId) throw new Error("channelId é obrigatório");
    return { channelId: String(data.channelId) };
  })
  .handler(async ({ data, context }): Promise<WhatsAppSessionDTO | null> => {
    const { supabase, userId } = context;
    const { data: row, error } = await (supabase as any)
      .from("channel_whatsapp_session_status")
      .select("channel_id,status,phone_number,session_id,connected_at,last_seen_at")
      .eq("user_id", userId)
      .eq("channel_id", data.channelId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return {
      channelId: row.channel_id,
      status: row.status as WhatsAppSessionStatus,
      phoneNumber: row.phone_number,
      sessionId: row.session_id,
      connectedAt: row.connected_at,
      lastSeenAt: row.last_seen_at,
    };
  });

export const disconnectWhatsAppSession = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { channelId: string }) => {
    if (!data?.channelId) throw new Error("channelId é obrigatório");
    return { channelId: String(data.channelId) };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const nowIso = new Date().toISOString();
    const { error: sessErr } = await (supabase as any)
      .from("channel_whatsapp_session_status")
      .update({ status: "disconnected", updated_at: nowIso })
      .eq("user_id", userId)
      .eq("channel_id", data.channelId);
    if (sessErr) throw new Error(sessErr.message);
    const { error: connErr } = await supabase
      .from("channel_whatsapp_connections")
      .update({ status: "disconnected", updated_at: nowIso })
      .eq("user_id", userId)
      .eq("channel_id", data.channelId);
    if (connErr) throw new Error(connErr.message);
    return { ok: true };
  });
