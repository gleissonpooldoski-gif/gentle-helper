import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const settingsInput = z.object({
  instagramBusinessId: z.string().min(1),
  facebookPageId: z.string().min(1),
  accessToken: z.string().min(20),
});

export type PublicSettings = {
  instagramBusinessId: string;
  facebookPageId: string;
  hasToken: boolean;
  updatedAt: string | null;
};

export const getInstagramAdminSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PublicSettings | null> => {
    const { data, error } = await (context.supabase as any)
      .from("instagram_settings")
      .select("instagram_business_id,facebook_page_id,access_token_ciphertext,updated_at")
      .eq("id", "default")
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      instagramBusinessId: data.instagram_business_id,
      facebookPageId: data.facebook_page_id,
      hasToken: !!data.access_token_ciphertext,
      updatedAt: data.updated_at,
    };
  });

export const saveInstagramAdminSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof settingsInput>) => settingsInput.parse(d))
  .handler(async ({ data }) => {
    const { saveSettings } = await import("./settings.server");
    await saveSettings(data);
    return { ok: true };
  });

export const testInstagramAdminConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof settingsInput> | { useSaved: true }) => d)
  .handler(async ({ data }) => {
    const { loadSettings } = await import("./settings.server");
    const { testConnection } = await import("./graph.server");
    let payload: { igId: string; token: string; pageId?: string };
    if ("useSaved" in (data as any)) {
      const s = await loadSettings();
      if (!s) throw new Error("Nenhuma configuração salva.");
      payload = {
        igId: s.instagramBusinessId,
        token: s.accessToken,
        pageId: s.facebookPageId,
      };
    } else {
      const parsed = settingsInput.parse(data);
      payload = {
        igId: parsed.instagramBusinessId,
        token: parsed.accessToken,
        pageId: parsed.facebookPageId,
      };
    }
    const info = await testConnection(payload);
    return { ok: true, info };
  });

export const listInstagramMedia = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { loadSettings } = await import("./settings.server");
    const { listMedia } = await import("./graph.server");
    const s = await loadSettings();
    if (!s) return [];
    return listMedia({ igId: s.instagramBusinessId, token: s.accessToken, limit: 30 });
  });

export const publishInstagramStory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { imageUrl: string; caption?: string }) =>
    z.object({ imageUrl: z.string().url(), caption: z.string().max(2200).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { loadSettings } = await import("./settings.server");
    const { publishStory } = await import("./graph.server");
    const s = await loadSettings();
    if (!s) throw new Error("Configure a conta Instagram primeiro.");
    const id = await publishStory({
      igId: s.instagramBusinessId,
      token: s.accessToken,
      imageUrl: data.imageUrl,
    });
    return { ok: true, mediaId: id };
  });

export const listInstagramAdminComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadSettings } = await import("./settings.server");
    const { listMedia, listCommentsForMedia } = await import("./graph.server");
    const s = await loadSettings();
    if (!s) return [];

    const media = await listMedia({
      igId: s.instagramBusinessId,
      token: s.accessToken,
      limit: 10,
    });

    const all: Array<{
      commentId: string;
      mediaId: string;
      username?: string;
      text: string;
      timestamp: string;
      reply?: string;
    }> = [];
    for (const m of media) {
      try {
        const cs = await listCommentsForMedia({
          mediaId: m.id,
          token: s.accessToken,
        });
        for (const c of cs) {
          all.push({
            commentId: c.id,
            mediaId: m.id,
            username: c.username,
            text: c.text,
            timestamp: c.timestamp,
          });
        }
      } catch {
        /* ignore per-media */
      }
    }

    // hydrate saved replies
    if (all.length) {
      const { data: rows } = await (context.supabase as any)
        .from("instagram_comments")
        .select("comment_id,reply")
        .in("comment_id", all.map((a) => a.commentId));
      const map = new Map<string, string>();
      for (const r of rows ?? []) if (r.reply) map.set(r.comment_id, r.reply);
      for (const a of all) {
        const r = map.get(a.commentId);
        if (r) a.reply = r;
      }
    }

    all.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    return all;
  });

export const replyInstagramAdminComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    commentId: string;
    mediaId?: string;
    username?: string;
    text: string;
    reply: string;
  }) =>
    z
      .object({
        commentId: z.string().min(1),
        mediaId: z.string().optional(),
        username: z.string().optional(),
        text: z.string(),
        reply: z.string().min(1).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { loadSettings } = await import("./settings.server");
    const { replyToComment } = await import("./graph.server");
    const s = await loadSettings();
    if (!s) throw new Error("Configure a conta Instagram primeiro.");
    await replyToComment({
      commentId: data.commentId,
      token: s.accessToken,
      message: data.reply,
    });
    await (context.supabase as any).from("instagram_comments").upsert(
      {
        comment_id: data.commentId,
        media_id: data.mediaId,
        username: data.username,
        comment: data.text,
        reply: data.reply,
        replied_at: new Date().toISOString(),
      },
      { onConflict: "comment_id" },
    );
    return { ok: true };
  });

export const listInstagramAdminConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { loadSettings } = await import("./settings.server");
    const { listConversations } = await import("./graph.server");
    const s = await loadSettings();
    if (!s) return [];
    try {
      const convs = await listConversations({
        pageId: s.facebookPageId,
        token: s.accessToken,
      });
      return convs.map((c) => {
        const p = c.participants?.data?.find((x) => x.username || x.name);
        const m = c.messages?.data?.[0];
        return {
          id: c.id,
          name: p?.username || p?.name || p?.id || "—",
          lastMessage: m?.message ?? "",
          updatedTime: c.updated_time,
          status: m ? "recebida" : "vazia",
        };
      });
    } catch (e: any) {
      return { error: e?.message ?? "Falha ao buscar conversas" } as any;
    }
  });

/* ---- Automations ---- */

export const listInstagramAutomations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("instagram_automations")
      .select("id,keyword,message,enabled,created_at")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const saveInstagramAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; keyword: string; message: string; enabled?: boolean }) =>
    z
      .object({
        id: z.string().uuid().optional(),
        keyword: z.string().min(1).max(80),
        message: z.string().min(1).max(2000),
        enabled: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const payload = {
      keyword: data.keyword.trim().toLowerCase(),
      message: data.message,
      enabled: data.enabled ?? true,
    };
    if (data.id) {
      const { error } = await (context.supabase as any)
        .from("instagram_automations")
        .update(payload)
        .eq("id", data.id);
      if (error) throw error;
    } else {
      const { error } = await (context.supabase as any)
        .from("instagram_automations")
        .insert(payload);
      if (error) throw error;
    }
    return { ok: true };
  });

export const deleteInstagramAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("instagram_automations")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const listInstagramLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("instagram_logs")
      .select("id,type,payload,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  });
