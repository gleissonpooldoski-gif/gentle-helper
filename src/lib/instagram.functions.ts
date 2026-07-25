import { createServerFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const channelInput = z.object({ channelId: z.string().uuid() });

export type IgConnectionView = {
  id: string;
  status: string;
  username: string | null;
  name: string | null;
  profilePicture: string | null;
  followers: number;
  follows: number;
  mediaCount: number;
  autoPostEnabled: boolean;
  growthEnabled: boolean;
  disableCommentReply: boolean;
  lastError: string | null;
};

export const getInstagramConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { channelId: string }) => channelInput.parse(d))
  .handler(async ({ data, context }): Promise<IgConnectionView | null> => {
    const { data: row, error } = await context.supabase
      .from("instagram_connections")
      .select("id,status,username,name,profile_picture,followers_count,follows_count,media_count,auto_post_enabled,growth_enabled,disable_comment_reply,last_error")
      .eq("channel_id", data.channelId)
      .maybeSingle();
    if (error) throw error;
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      username: row.username,
      name: row.name,
      profilePicture: row.profile_picture,
      followers: row.followers_count ?? 0,
      follows: row.follows_count ?? 0,
      mediaCount: row.media_count ?? 0,
      autoPostEnabled: row.auto_post_enabled ?? false,
      growthEnabled: row.growth_enabled ?? false,
      disableCommentReply: row.disable_comment_reply ?? false,
      lastError: row.last_error,
    };
  });

export const startInstagramOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { channelId: string }) => channelInput.parse(d))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const clientId = process.env.META_APP_ID;
    if (!clientId) throw new Error("META_APP_ID missing");
    const host = getRequestHost();
    const proto = host.includes("localhost") ? "http" : "https";
    const redirectUri = `${proto}://${host}/api/public/instagram/callback`;
    const { buildOAuthAuthorizeUrl } = await import("./instagram-graph.server");
    const state = Buffer.from(JSON.stringify({ u: context.userId, c: data.channelId })).toString("base64url");
    return { url: buildOAuthAuthorizeUrl({ clientId, redirectUri, state }) };
  });

export const disconnectInstagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { channelId: string }) => channelInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("instagram_connections")
      .delete()
      .eq("channel_id", data.channelId);
    if (error) throw error;
    return { ok: true };
  });

export const updateInstagramFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { channelId: string; autoPostEnabled?: boolean; growthEnabled?: boolean; disableCommentReply?: boolean }) =>
    z.object({
      channelId: z.string().uuid(),
      autoPostEnabled: z.boolean().optional(),
      growthEnabled: z.boolean().optional(),
      disableCommentReply: z.boolean().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const patch: { auto_post_enabled?: boolean; growth_enabled?: boolean; disable_comment_reply?: boolean } = {};
    if (data.autoPostEnabled !== undefined) patch.auto_post_enabled = data.autoPostEnabled;
    if (data.growthEnabled !== undefined) patch.growth_enabled = data.growthEnabled;
    if (data.disableCommentReply !== undefined) patch.disable_comment_reply = data.disableCommentReply;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase
      .from("instagram_connections")
      .update(patch)
      .eq("channel_id", data.channelId);
    if (error) throw error;
    return { ok: true };
  });

/* ---------- Keywords ---------- */

export const listInstagramKeywords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { channelId: string }) => channelInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("instagram_keywords")
      .select("id,keyword,active,comment_reply_enabled,comment_reply_text")
      .eq("channel_id", data.channelId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

export const saveInstagramKeyword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    channelId: string; id?: string; keyword: string; active?: boolean;
    commentReplyEnabled?: boolean; commentReplyText?: string;
  }) => z.object({
    channelId: z.string().uuid(),
    id: z.string().uuid().optional(),
    keyword: z.string().min(1).max(60),
    active: z.boolean().optional(),
    commentReplyEnabled: z.boolean().optional(),
    commentReplyText: z.string().max(500).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const payload = {
      user_id: context.userId,
      channel_id: data.channelId,
      keyword: data.keyword.trim().toLowerCase(),
      active: data.active ?? true,
      comment_reply_enabled: data.commentReplyEnabled ?? true,
      comment_reply_text: data.commentReplyText ?? "Te mandei o link no privado 😉",
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("instagram_keywords").update(payload).eq("id", data.id);
      if (error) throw error;
    } else {
      const { error } = await context.supabase
        .from("instagram_keywords").insert(payload);
      if (error) throw error;
    }
    return { ok: true };
  });

export const deleteInstagramKeyword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("instagram_keywords").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ---------- Template ---------- */

export const getInstagramTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { channelId: string }) => channelInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("instagram_story_templates")
      .select("id,image_url,title_color,price_color,caption_template")
      .eq("channel_id", data.channelId)
      .eq("active", true)
      .maybeSingle();
    if (error) throw error;
    return row;
  });

export const saveInstagramTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    channelId: string; imageUrl: string; titleColor: string; priceColor: string; captionTemplate?: string;
  }) => z.object({
    channelId: z.string().uuid(),
    imageUrl: z.string().url(),
    titleColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    priceColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    captionTemplate: z.string().max(2000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("instagram_story_templates")
      .update({ active: false }).eq("channel_id", data.channelId);
    const { error } = await context.supabase.from("instagram_story_templates").insert({
      user_id: context.userId,
      channel_id: data.channelId,
      image_url: data.imageUrl,
      title_color: data.titleColor,
      price_color: data.priceColor,
      caption_template: data.captionTemplate ?? "🔥 {title}\n💰 {price}\n\nClique no link 👇\n{link}",
      active: true,
    });
    if (error) throw error;
    return { ok: true };
  });

/* ---------- Schedule ---------- */

export const getInstagramSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { channelId: string }) => channelInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("instagram_story_schedule")
      .select("days,hours,active")
      .eq("channel_id", data.channelId)
      .maybeSingle();
    if (error) throw error;
    return row;
  });

export const saveInstagramSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { channelId: string; days: number[]; hours: number[]; active: boolean }) =>
    z.object({
      channelId: z.string().uuid(),
      days: z.array(z.number().int().min(0).max(6)),
      hours: z.array(z.number().int().min(0).max(23)),
      active: z.boolean(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("instagram_story_schedule").upsert({
      user_id: context.userId,
      channel_id: data.channelId,
      days: data.days,
      hours: data.hours,
      active: data.active,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,channel_id" });
    if (error) throw error;
    return { ok: true };
  });

/* ---------- Manual publish (used by the "Novo Agendamento" flow) ---------- */

export const publishInstagramNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { channelId: string; productId: string; kind: "post" | "story" }) =>
    z.object({
      channelId: z.string().uuid(),
      productId: z.string().uuid(),
      kind: z.enum(["post", "story"]),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { publishForChannel } = await import("./instagram-publish.server");
    return publishForChannel({
      channelId: data.channelId,
      productId: data.productId,
      kind: data.kind,
      userId: context.userId,
    });
  });

/* ---------- Stats ---------- */

export const getInstagramStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { channelId: string }) => channelInput.parse(d))
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const [posts, events] = await Promise.all([
      context.supabase.from("instagram_posts")
        .select("kind,status").eq("channel_id", data.channelId).gte("created_at", since),
      context.supabase.from("instagram_events")
        .select("kind").eq("channel_id", data.channelId).gte("created_at", since),
    ]);
    const p = posts.data ?? [];
    const e = events.data ?? [];
    return {
      postsPublished: p.filter((r) => r.kind === "post" && r.status === "published").length,
      storiesPublished: p.filter((r) => r.kind === "story" && r.status === "published").length,
      commentsReceived: e.filter((r) => r.kind === "comment").length,
      dmsSent: e.filter((r) => r.kind === "dm_sent").length,
      clicks: e.filter((r) => r.kind === "click").length,
    };
  });
