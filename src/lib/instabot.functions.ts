import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { fetchWithTimeout, TIMEOUTS } from "@/lib/http-timeout";

/* ---------------- Types ---------------- */

export type InstabotMediaDTO = {
  id: string;
  caption: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  timestamp: string | null;
};

export type InstabotAutomationDTO = {
  id: string;
  channelId: string;
  igMediaId: string;
  igMediaUrl: string | null;
  thumbnailUrl: string | null;
  caption: string | null;
  postedAt: string | null;
  enabled: boolean;
  keywords: string[];
  commentReplyMode: "auto" | "list";
  commentReplies: string[];
  dmMessage: string;
  buttonLabel: string;
  buttonUrl: string;
  updatedAt: string;
};

export type InstabotEventDTO = {
  id: string;
  igUsername: string | null;
  commentText: string | null;
  commentReply: string | null;
  dmSent: boolean;
  dmMessage: string | null;
  status: string;
  error: string | null;
  createdAt: string;
};

export type InstabotStatsDTO = {
  detected: number;
  dmsSent: number;
  clicks: number;
  responseRate: number;
};

/* ---------------- Validators ---------------- */

const channelInput = z.object({ channelId: z.string().uuid() });
const idInput = z.object({ id: z.string().uuid() });

const upsertInput = z.object({
  id: z.string().uuid().optional(),
  channelId: z.string().uuid(),
  igMediaId: z.string().min(1),
  igMediaUrl: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
  postedAt: z.string().nullable().optional(),
  enabled: z.boolean().default(true),
  keywords: z.array(z.string().min(1)).max(50),
  commentReplyMode: z.enum(["auto", "list"]).default("list"),
  commentReplies: z.array(z.string().min(1)).max(50).default([]),
  dmMessage: z.string().max(2000).default(""),
  buttonLabel: z.string().max(20).default("VER PRODUTO"),
  buttonUrl: z.string().max(2048).default(""),
});

/* ---------------- Row mapper ---------------- */

function rowToAutomation(r: any): InstabotAutomationDTO {
  return {
    id: r.id,
    channelId: r.channel_id,
    igMediaId: r.ig_media_id,
    igMediaUrl: r.ig_media_url,
    thumbnailUrl: r.thumbnail_url,
    caption: r.caption,
    postedAt: r.posted_at,
    enabled: !!r.enabled,
    keywords: r.keywords ?? [],
    commentReplyMode: (r.comment_reply_mode ?? "list") as "auto" | "list",
    commentReplies: r.comment_replies ?? [],
    dmMessage: r.dm_message ?? "",
    buttonLabel: r.button_label ?? "VER PRODUTO",
    buttonUrl: r.button_url ?? "",
    updatedAt: r.updated_at,
  };
}

/* ---------------- List Instagram media ---------------- */

export const listInstagramMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { channelId: string }) => channelInput.parse(d))
  .handler(async ({ data, context }): Promise<InstabotMediaDTO[]> => {
    const { data: conn } = await context.supabase
      .from("instagram_connections")
      .select("instagram_account_id, access_token_ciphertext")
      .eq("channel_id", data.channelId)
      .maybeSingle();
    if (!conn?.instagram_account_id || !conn.access_token_ciphertext) return [];
    const { decryptToken } = await import("./instagram-crypto.server");
    const token = decryptToken(conn.access_token_ciphertext);
    const url = new URL(`https://graph.facebook.com/v21.0/${conn.instagram_account_id}/media`);
    url.searchParams.set("access_token", token);
    url.searchParams.set(
      "fields",
      "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp",
    );
    url.searchParams.set("limit", "24");
    const res = await fetchWithTimeout(url.toString(), {}, { timeoutMs: TIMEOUTS.api, label: "instabot ig-media" });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || body?.error) {
      throw new Error(body?.error?.message ?? `Meta ${res.status}`);
    }
    const items: any[] = body.data ?? [];
    return items.map((m) => ({
      id: m.id,
      caption: m.caption ?? null,
      mediaType: m.media_type ?? null,
      mediaUrl: m.media_url ?? null,
      thumbnailUrl: m.thumbnail_url ?? m.media_url ?? null,
      permalink: m.permalink ?? null,
      timestamp: m.timestamp ?? null,
    }));
  });

/* ---------------- CRUD ---------------- */

export const listAutomations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { channelId: string }) => channelInput.parse(d))
  .handler(async ({ data, context }): Promise<InstabotAutomationDTO[]> => {
    const { data: rows, error } = await context.supabase
      .from("instabot_automations")
      .select("*")
      .eq("channel_id", data.channelId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (rows ?? []).map(rowToAutomation);
  });

export const upsertAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertInput.parse(d))
  .handler(async ({ data, context }): Promise<InstabotAutomationDTO> => {
    const payload = {
      user_id: context.userId,
      channel_id: data.channelId,
      ig_media_id: data.igMediaId,
      ig_media_url: data.igMediaUrl ?? null,
      thumbnail_url: data.thumbnailUrl ?? null,
      caption: data.caption ?? null,
      posted_at: data.postedAt ?? null,
      enabled: data.enabled,
      keywords: data.keywords,
      comment_reply_mode: data.commentReplyMode,
      comment_replies: data.commentReplies,
      dm_message: data.dmMessage,
      button_label: data.buttonLabel,
      button_url: data.buttonUrl,
    };
    const { data: row, error } = await context.supabase
      .from("instabot_automations")
      .upsert(payload, { onConflict: "channel_id,ig_media_id" })
      .select("*")
      .single();
    if (error) throw error;
    return rowToAutomation(row);
  });

export const deleteAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => idInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("instabot_automations")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const toggleAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; enabled: boolean }) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<InstabotAutomationDTO> => {
    const { data: row, error } = await context.supabase
      .from("instabot_automations")
      .update({ enabled: data.enabled })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw error;
    return rowToAutomation(row);
  });

/* ---------------- History + Stats ---------------- */

export const listAutomationHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { channelId: string; automationId?: string; limit?: number }) =>
    z
      .object({
        channelId: z.string().uuid(),
        automationId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<InstabotEventDTO[]> => {
    let q = context.supabase
      .from("instabot_events")
      .select("id,ig_username,comment_text,comment_reply,dm_sent,dm_message,status,error,created_at")
      .eq("channel_id", data.channelId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.automationId) q = q.eq("automation_id", data.automationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      igUsername: r.ig_username,
      commentText: r.comment_text,
      commentReply: r.comment_reply,
      dmSent: !!r.dm_sent,
      dmMessage: r.dm_message,
      status: r.status,
      error: r.error,
      createdAt: r.created_at,
    }));
  });

export const getChannelStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { channelId: string }) => channelInput.parse(d))
  .handler(async ({ data, context }): Promise<InstabotStatsDTO> => {
    const [{ count: detected }, { count: dmsSent }, autos] = await Promise.all([
      context.supabase
        .from("instabot_events")
        .select("id", { count: "exact", head: true })
        .eq("channel_id", data.channelId),
      context.supabase
        .from("instabot_events")
        .select("id", { count: "exact", head: true })
        .eq("channel_id", data.channelId)
        .eq("dm_sent", true),
      context.supabase
        .from("instabot_automations")
        .select("id")
        .eq("channel_id", data.channelId),
    ]);
    let clicks = 0;
    const ids = (autos.data ?? []).map((a: any) => a.id);
    if (ids.length) {
      const { count } = await context.supabase
        .from("instabot_clicks")
        .select("id", { count: "exact", head: true })
        .in("automation_id", ids);
      clicks = count ?? 0;
    }
    const d = detected ?? 0;
    const s = dmsSent ?? 0;
    return {
      detected: d,
      dmsSent: s,
      clicks,
      responseRate: d > 0 ? Math.round((s / d) * 100) : 0,
    };
  });

/* ---------------- AI generate ---------------- */

export const generateAutomationWithAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { caption?: string | null; niche?: string | null }) =>
    z
      .object({
        caption: z.string().nullable().optional(),
        niche: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
    }): Promise<{
      keywords: string[];
      commentReplies: string[];
      dmMessage: string;
      buttonLabel: string;
    }> => {
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");
      const system =
        "Você cria automações de comentário/Direct para Instagram de afiliados brasileiros. Sempre responda em português.";
      const user = [
        "Gere uma automação para a publicação abaixo.",
        data.caption ? `Legenda: ${data.caption}` : "Sem legenda disponível.",
        data.niche ? `Nicho: ${data.niche}` : "",
        "Retorne JSON com: keywords (array 3-6 palavras-gatilho curtas em maiúsculas), commentReplies (array 4 frases curtas para responder no comentário), dmMessage (mensagem persuasiva, 3-6 linhas, com emojis), buttonLabel (máx 18 caracteres).",
      ]
        .filter(Boolean)
        .join("\n");
      const res = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-3.6-flash",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
        }),
      }, { timeoutMs: TIMEOUTS.ai, label: "ai-gateway instabot" });
      if (!res.ok) {
        const t = await res.text();
        if (res.status === 429) throw new Error("Limite de IA atingido, tente novamente em instantes.");
        if (res.status === 402) throw new Error("Créditos de IA esgotados.");
        throw new Error(`AI ${res.status}: ${t.slice(0, 200)}`);
      }
      const body: any = await res.json();
      const raw = body?.choices?.[0]?.message?.content ?? "{}";
      let parsed: any = {};
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = {};
      }
      const asArray = (v: any): string[] =>
        Array.isArray(v)
          ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 20)
          : [];
      return {
        keywords: asArray(parsed.keywords).map((k) => k.toUpperCase()),
        commentReplies: asArray(parsed.commentReplies),
        dmMessage: String(parsed.dmMessage ?? "").slice(0, 1500),
        buttonLabel: String(parsed.buttonLabel ?? "VER PRODUTO").slice(0, 20),
      };
    },
  );
