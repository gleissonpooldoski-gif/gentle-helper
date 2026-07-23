import { createServerFn } from "@tanstack/react-start";
import { randomBytes, createHash } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { apiClient } from "@/lib/api-client";

const TOKEN_TTL_MINUTES = 15;

export type WASessionStatus = "pending" | "connecting" | "connected" | "disconnected";

export interface WASessionDTO {
  id: string;
  name: string;
  phoneNumber: string | null;
  status: WASessionStatus;
  connectedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  linkedChannels: number;
}

export interface WASessionWithKeyDTO extends WASessionDTO {
  /** Raw connection token — returned only at creation time. */
  sessionKey: string;
  /** ISO date when the token expires. */
  expiresAt: string;
}

const PLAN_LIMITS: Record<string, number> = {
  free: 1,
  premium: 5,
};

function planLimit(plan: string | null | undefined): number {
  return PLAN_LIMITS[plan ?? "free"] ?? 1;
}

function makeToken(): string {
  // Short, easy-to-copy token
  return `wa_${randomBytes(12).toString("hex")}`;
}

function hashToken(t: string): string {
  return createHash("sha256").update(t).digest("hex");
}

async function fetchLinkedCounts(supabase: any, sessionIds: string[]) {
  if (sessionIds.length === 0) return new Map<string, number>();
  const { data, error } = await supabase
    .from("channel_whatsapp_sessions")
    .select("session_id")
    .in("session_id", sessionIds);
  if (error) throw new Error(error.message);
  const map = new Map<string, number>();
  for (const r of data ?? []) {
    map.set(r.session_id, (map.get(r.session_id) ?? 0) + 1);
  }
  return map;
}

export const listWhatsAppSessions = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .handler(async ({ context }): Promise<WASessionDTO[]> => {
    const { supabase, userId } = context;
    const { data, error } = await (supabase as any)
      .from("whatsapp_sessions")
      .select("id,name,phone_number,status,connected_at,last_seen_at,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((r: any) => r.id);
    const counts = await fetchLinkedCounts(supabase, ids);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      phoneNumber: r.phone_number,
      status: r.status,
      connectedAt: r.connected_at,
      lastSeenAt: r.last_seen_at,
      createdAt: r.created_at,
      linkedChannels: counts.get(r.id) ?? 0,
    }));
  });

export const createWhatsAppSession = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { name: string }) => {
    const name = String(data?.name ?? "").trim();
    if (!name) throw new Error("Nome da sessão é obrigatório");
    if (name.length > 80) throw new Error("Nome muito longo (máx. 80)");
    return { name };
  })
  .handler(async ({ data, context }): Promise<WASessionWithKeyDTO> => {
    const { supabase, userId } = context;

    const { data: userRow } = await supabase
      .from("users")
      .select("plan")
      .eq("id", userId)
      .maybeSingle();
    const limit = planLimit(userRow?.plan);

    const { count, error: cntErr } = await (supabase as any)
      .from("whatsapp_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "connected");
    if (cntErr) throw new Error(cntErr.message);
    if ((count ?? 0) >= limit) {
      throw new Error(`Você atingiu o limite de ${limit} sessões WhatsApp do seu plano.`);
    }

    const token = makeToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000).toISOString();
    const { data: row, error } = await (supabase as any)
      .from("whatsapp_sessions")
      .insert({
        user_id: userId,
        name: data.name,
        session_key: token, // legacy column kept in sync
        token_hash: tokenHash,
        expires_at: expiresAt,
        status: "pending",
      })
      .select("id,name,phone_number,status,connected_at,last_seen_at,created_at")
      .single();
    if (error) throw new Error(error.message);
    return {
      id: row.id,
      name: row.name,
      phoneNumber: row.phone_number,
      status: row.status,
      connectedAt: row.connected_at,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
      sessionKey: token,
      expiresAt,
      linkedChannels: 0,
    };
  });

export const confirmWhatsAppSession = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { sessionId: string; phoneNumber?: string }) => {
    if (!data?.sessionId) throw new Error("sessionId é obrigatório");
    return {
      sessionId: String(data.sessionId),
      phoneNumber: data.phoneNumber ? String(data.phoneNumber).slice(0, 32) : null,
    };
  })
  .handler(async ({ data, context }): Promise<WASessionDTO> => {
    const { supabase, userId } = context;
    const nowIso = new Date().toISOString();
    const { data: row, error } = await (supabase as any)
      .from("whatsapp_sessions")
      .update({
        status: "connected",
        connected_at: nowIso,
        last_seen_at: nowIso,
        phone_number: data.phoneNumber,
      })
      .eq("user_id", userId)
      .eq("id", data.sessionId)
      .select("id,name,phone_number,status,connected_at,last_seen_at,created_at")
      .single();
    if (error) throw new Error(error.message);
    return {
      id: row.id,
      name: row.name,
      phoneNumber: row.phone_number,
      status: row.status,
      connectedAt: row.connected_at,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
      linkedChannels: 0,
    };
  });

export const deleteWhatsAppSession = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { sessionId: string }) => {
    if (!data?.sessionId) throw new Error("sessionId é obrigatório");
    return { sessionId: String(data.sessionId) };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const { error } = await (supabase as any)
      .from("whatsapp_sessions")
      .delete()
      .eq("user_id", userId)
      .eq("id", data.sessionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export interface ChannelSessionDTO {
  session: WASessionDTO | null;
}

export const getChannelWhatsAppSession = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { channelId: string }) => {
    if (!data?.channelId) throw new Error("channelId é obrigatório");
    return { channelId: String(data.channelId) };
  })
  .handler(async ({ data, context }): Promise<ChannelSessionDTO> => {
    const { supabase, userId } = context;
    const { data: link, error } = await (supabase as any)
      .from("channel_whatsapp_sessions")
      .select("session_id")
      .eq("channel_id", data.channelId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!link) return { session: null };
    const { data: row, error: sErr } = await (supabase as any)
      .from("whatsapp_sessions")
      .select("id,name,phone_number,status,connected_at,last_seen_at,created_at")
      .eq("user_id", userId)
      .eq("id", link.session_id)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!row) return { session: null };
    return {
      session: {
        id: row.id,
        name: row.name,
        phoneNumber: row.phone_number,
        status: row.status,
        connectedAt: row.connected_at,
        lastSeenAt: row.last_seen_at,
        createdAt: row.created_at,
        linkedChannels: 0,
      },
    };
  });

export const linkChannelToSession = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { channelId: string; sessionId: string }) => {
    if (!data?.channelId) throw new Error("channelId é obrigatório");
    if (!data?.sessionId) throw new Error("sessionId é obrigatório");
    return { channelId: String(data.channelId), sessionId: String(data.sessionId) };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const { data: sess, error: sErr } = await (supabase as any)
      .from("whatsapp_sessions")
      .select("id")
      .eq("user_id", userId)
      .eq("id", data.sessionId)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!sess) throw new Error("Sessão não encontrada");

    const { error } = await (supabase as any)
      .from("channel_whatsapp_sessions")
      .upsert(
        { channel_id: data.channelId, session_id: data.sessionId },
        { onConflict: "channel_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unlinkChannelSession = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { channelId: string }) => {
    if (!data?.channelId) throw new Error("channelId é obrigatório");
    return { channelId: String(data.channelId) };
  })
  .handler(async ({ data, context: _context }): Promise<{ ok: true }> => {
    const { supabase } = _context;
    const { error } = await (supabase as any)
      .from("channel_whatsapp_sessions")
      .delete()
      .eq("channel_id", data.channelId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export interface WASessionStatusDTO {
  id: string;
  status: WASessionStatus;
  phoneNumber: string | null;
  connectedAt: string | null;
  lastSeenAt: string | null;
  expiresAt: string | null;
}

export const getWhatsAppSessionStatus = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { sessionId: string }) => {
    if (!data?.sessionId) throw new Error("sessionId é obrigatório");
    return { sessionId: String(data.sessionId) };
  })
  .handler(async ({ data, context }): Promise<WASessionStatusDTO> => {
    const { supabase, userId } = context;
    const { data: row, error } = await (supabase as any)
      .from("whatsapp_sessions")
      .select("id,status,phone_number,connected_at,last_seen_at,expires_at")
      .eq("user_id", userId)
      .eq("id", data.sessionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Sessão não encontrada");
    return {
      id: row.id,
      status: row.status,
      phoneNumber: row.phone_number,
      connectedAt: row.connected_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
    };
  });
