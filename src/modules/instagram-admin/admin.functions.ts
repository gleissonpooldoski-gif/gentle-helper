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
  .inputValidator((d: { mediaId?: string } | undefined) =>
    z.object({ mediaId: z.string().optional() }).optional().parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = (context.supabase as any)
      .from("instagram_automations")
      .select(
        "id,keyword,message,enabled,created_at,media_id,comment_reply,button_label,button_url,extra_links,scope,product_id",
      )
      .order("created_at", { ascending: false });
    if (data?.mediaId) q = q.eq("media_id", data.mediaId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const saveInstagramAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id?: string;
      keyword: string;
      message: string;
      enabled?: boolean;
      product_id?: string;
      scope?: "both" | "comment" | "message";
      media_id?: string;
      comment_reply?: string;
      button_label?: string;
      button_url?: string;
      extra_links?: Array<{ label: string; url: string }>;
    }) =>
      z
        .object({
          id: z.string().uuid().optional(),
          keyword: z.string().min(1).max(80),
          message: z.string().min(1).max(2000),
          enabled: z.boolean().optional(),
          product_id: z.string().uuid().optional(),
          scope: z.enum(["both", "comment", "message"]).optional(),
          media_id: z.string().max(120).optional(),
          comment_reply: z.string().max(1000).optional(),
          button_label: z.string().max(80).optional(),
          button_url: z.string().url().optional().or(z.literal("")),
          extra_links: z
            .array(z.object({ label: z.string().max(80), url: z.string().url() }))
            .optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const payload: any = {
      keyword: data.keyword.trim().toLowerCase(),
      message: data.message,
      enabled: data.enabled ?? true,
      product_id: data.product_id ?? null,
      scope: data.scope ?? "both",
      media_id: data.media_id ?? null,
      comment_reply: data.comment_reply ?? null,
      button_label: data.button_label ?? null,
      button_url: data.button_url || null,
      extra_links: data.extra_links ?? [],
    };
    if (data.id) {
      const { error } = await (context.supabase as any)
        .from("instagram_automations")
        .update(payload)
        .eq("id", data.id);
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await (context.supabase as any)
      .from("instagram_automations")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: row.id };
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

/* ---- AI: preencher automaticamente palavra-chave/respostas/DM ---- */

export const suggestAutomationCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { caption?: string; mediaId?: string; hint?: string }) =>
      z
        .object({
          caption: z.string().max(4000).optional(),
          mediaId: z.string().max(120).optional(),
          hint: z.string().max(500).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");

    const system =
      "Você é um copywriter especialista em Instagram para afiliados. Responda SEMPRE em JSON válido com as chaves: keyword (uma palavra-chave curta em minúsculas, sem #), comment_reply (uma resposta curta e amigável ao comentário, com emojis), dm_message (texto da DM em até 300 caracteres, com emojis, incluindo o marcador {{link}} onde entrará o link do afiliado), button_label (rótulo curto do botão, ex.: 'VER OFERTA'). Não escreva nada fora do JSON.";
    const user = [
      "Contexto do post do Instagram:",
      data.caption ? `Legenda: """${data.caption}"""` : "(sem legenda)",
      data.hint ? `Observação: ${data.hint}` : "",
      "Gere copy em português do Brasil, tom brasileiro, com gatilhos de urgência e curiosidade.",
    ]
      .filter(Boolean)
      .join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Lovable AI (${res.status}): ${t.slice(0, 200)}`);
    }
    const json = (await res.json()) as any;
    const raw = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
    return {
      keyword: String(parsed.keyword ?? "eu quero").slice(0, 60).toLowerCase(),
      comment_reply: String(parsed.comment_reply ?? "").slice(0, 500),
      dm_message: String(parsed.dm_message ?? "").slice(0, 500),
      button_label: String(parsed.button_label ?? "VER OFERTA").slice(0, 40),
    };
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

/* ---- Products (affiliate) ---- */

export const listInstagramProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("products")
      .select(
        "id,title,image_url,original_price,promo_price,affiliate_link,raw_link,store_name,category,availability,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  });

/* ---- Story Templates (Fabric.js) ---- */

const templateInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  fabric_json: z.any().optional(),
  image_url: z.string().url().optional().or(z.literal("")),
  image_base64: z.string().optional(),
  title_color: z.string().max(20).optional(),
  price_color: z.string().max(20).optional(),
  is_default: z.boolean().optional(),
});

export const listStoryTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("instagram_story_templates")
      .select("id,name,fabric_json,image_url,title_color,price_color,is_default,active,created_at,updated_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const saveStoryTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof templateInput>) => templateInput.parse(d))
  .handler(async ({ data, context }) => {
    let imageUrl = data.image_url || "";

    if (data.image_base64) {
      const b64 = data.image_base64.includes(",")
        ? data.image_base64.split(",")[1]
        : data.image_base64;
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const filename = `template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
      const { error: upErr } = await (supabaseAdmin as any).storage
        .from("story-images")
        .upload(filename, bytes, { contentType: "image/png", upsert: false });
      if (upErr) throw upErr;
      const { data: signed, error: signErr } = await (supabaseAdmin as any).storage
        .from("story-images")
        .createSignedUrl(filename, 60 * 60 * 24 * 365);
      if (signErr) throw signErr;
      imageUrl = signed.signedUrl;
    }

    const payload: any = {
      name: data.name,
      fabric_json: data.fabric_json ?? {},
      image_url: imageUrl,
      title_color: data.title_color || "#000000",
      price_color: data.price_color || "#ef4444",
      is_default: data.is_default ?? false,
      user_id: context.userId,
      channel_id: context.userId,
      caption_template: "",
      active: true,
    };

    if (data.is_default) {
      await (context.supabase as any)
        .from("instagram_story_templates")
        .update({ is_default: false })
        .neq("id", data.id ?? "00000000-0000-0000-0000-000000000000");
    }
    if (data.id) {
      const update: any = {
        name: payload.name,
        title_color: payload.title_color,
        price_color: payload.price_color,
        is_default: payload.is_default,
      };
      if (imageUrl) update.image_url = imageUrl;
      if (data.fabric_json !== undefined) update.fabric_json = data.fabric_json;
      const { error } = await (context.supabase as any)
        .from("instagram_story_templates")
        .update(update)
        .eq("id", data.id);
      if (error) throw error;
      return { ok: true, id: data.id };
    } else {
      const { data: row, error } = await (context.supabase as any)
        .from("instagram_story_templates")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return { ok: true, id: row.id };
    }
  });

export const deleteStoryTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("instagram_story_templates")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });


/* ---- Campaigns: publish story from product ---- */

const publishCampaignInput = z.object({
  productId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  imageBase64: z.string().min(100), // data URL or raw base64 PNG
  keyword: z.string().max(80).optional(),
  message: z.string().max(2000).optional(),
});

export const publishStoryCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof publishCampaignInput>) => publishCampaignInput.parse(d))
  .handler(async ({ data, context }) => {
    const start = Date.now();
    const { loadSettings } = await import("./settings.server");
    const { publishStory } = await import("./graph.server");
    const settings = await loadSettings();
    if (!settings) throw new Error("Configure a conta Instagram primeiro.");

    const { data: prod, error: pErr } = await (context.supabase as any)
      .from("products")
      .select("id,title,affiliate_link,raw_link,image_url")
      .eq("id", data.productId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!prod) throw new Error("Produto não encontrado");
    const affiliateLink: string = prod.affiliate_link || prod.raw_link;

    // Decode base64 → bytes
    const b64 = data.imageBase64.includes(",")
      ? data.imageBase64.split(",")[1]
      : data.imageBase64;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const filename = `story-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    const { error: upErr } = await (supabaseAdmin as any).storage
      .from("story-images")
      .upload(filename, bytes, { contentType: "image/png", upsert: false });
    if (upErr) throw upErr;
    const { data: signed, error: signErr } = await (supabaseAdmin as any).storage
      .from("story-images")
      .createSignedUrl(filename, 60 * 60);
    if (signErr) throw signErr;
    const imageUrl: string = signed.signedUrl;

    let storyId = "";
    let error: string | null = null;
    try {
      storyId = await publishStory({
        igId: settings.instagramBusinessId,
        token: settings.accessToken,
        imageUrl,
      });
    } catch (e: any) {
      error = e?.message ?? "Falha ao publicar";
    }

    await (context.supabase as any).from("instagram_campaigns").insert({
      story_id: storyId || null,
      product_id: data.productId,
      template_id: data.templateId ?? null,
      keyword: (data.keyword ?? "").toLowerCase() || null,
      message: data.message ?? "",
      affiliate_link: affiliateLink,
      status: error ? "failed" : "published",
      error,
      published_at: error ? null : new Date().toISOString(),
    });

    await (context.supabase as any).from("instagram_logs").insert({
      type: error ? "story_publish_failed" : "story_published",
      payload: { productId: data.productId, storyId, error },
      latency_ms: Date.now() - start,
    });

    if (error) throw new Error(error);
    return { ok: true, storyId };
  });

export const listInstagramCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("instagram_campaigns")
      .select(
        "id,story_id,product_id,template_id,keyword,message,affiliate_link,status,error,published_at,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  });

/* ---- Dashboard stats + Diagnostics ---- */

export const getInstagramDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const isoDay = since.toISOString();

    const [{ data: pubs }, { data: dms }, { data: comments }, { data: autoRuns }, { data: top }] =
      await Promise.all([
        (context.supabase as any)
          .from("instagram_campaigns")
          .select("id")
          .gte("published_at", isoDay)
          .eq("status", "published"),
        (context.supabase as any)
          .from("instagram_logs")
          .select("id")
          .eq("type", "dm_auto_sent")
          .gte("created_at", isoDay),
        (context.supabase as any)
          .from("instagram_comments")
          .select("id")
          .not("reply", "is", null)
          .gte("replied_at", isoDay),
        (context.supabase as any)
          .from("instagram_logs")
          .select("id")
          .in("type", ["dm_auto_sent", "comment_auto_replied", "story_reply_auto_dm"])
          .gte("created_at", isoDay),
        (context.supabase as any)
          .from("instagram_campaigns")
          .select("product_id")
          .eq("status", "published")
          .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
      ]);

    const topMap = new Map<string, number>();
    for (const r of top ?? []) if (r.product_id) topMap.set(r.product_id, (topMap.get(r.product_id) ?? 0) + 1);
    const topIds = [...topMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    let topProducts: Array<{ id: string; title: string; count: number }> = [];
    if (topIds.length) {
      const { data: rows } = await (context.supabase as any)
        .from("products")
        .select("id,title")
        .in("id", topIds.map(([id]) => id));
      const nm = new Map<string, string>((rows ?? []).map((r: any) => [r.id, r.title]));
      topProducts = topIds.map(([id, count]) => ({ id, title: nm.get(id) ?? "—", count }));
    }

    const responseRate = (dms?.length ?? 0) + (comments?.length ?? 0);
    return {
      storiesToday: pubs?.length ?? 0,
      commentsReplied: comments?.length ?? 0,
      dmsSent: dms?.length ?? 0,
      automationsRun: autoRuns?.length ?? 0,
      responseRate,
      topProducts,
    };
  });

export const getInstagramDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadSettings } = await import("./settings.server");
    const { testConnection } = await import("./graph.server");
    const s = await loadSettings();
    if (!s) return { configured: false } as const;

    let conn: any = null;
    let error: string | null = null;
    try {
      conn = await testConnection({
        igId: s.instagramBusinessId,
        token: s.accessToken,
        pageId: s.facebookPageId,
      });
    } catch (e: any) {
      error = e?.message ?? "Falha";
    }

    const [{ data: lastStory }, { data: lastDm }, { data: lastComment }] = await Promise.all([
      (context.supabase as any)
        .from("instagram_campaigns")
        .select("published_at")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      (context.supabase as any)
        .from("instagram_logs")
        .select("created_at")
        .eq("type", "dm_auto_sent")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      (context.supabase as any)
        .from("instagram_comments")
        .select("replied_at")
        .not("reply", "is", null)
        .order("replied_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return {
      configured: true,
      error,
      info: conn,
      businessId: s.instagramBusinessId,
      pageId: s.facebookPageId,
      lastStoryAt: lastStory?.published_at ?? null,
      lastDmAt: lastDm?.created_at ?? null,
      lastCommentAt: lastComment?.replied_at ?? null,
    };
  });

/* ---- Recurring Story Schedule ---- */

export type AdminSchedule = {
  days: number[];
  hours: number[];
  templateId: string | null;
  active: boolean;
  lastRunAt: string | null;
};

export const getAdminStorySchedule = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminSchedule> => {
    const { data, error } = await (context.supabase as any)
      .from("instagram_admin_schedule")
      .select("days,hours,template_id,active,last_run_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    return {
      days: data?.days ?? [],
      hours: data?.hours ?? [],
      templateId: data?.template_id ?? null,
      active: data?.active ?? true,
      lastRunAt: data?.last_run_at ?? null,
    };
  });

const scheduleInput = z.object({
  days: z.array(z.number().int().min(0).max(6)).max(7),
  hours: z.array(z.number().int().min(0).max(23)).max(24),
  templateId: z.string().uuid().optional().nullable(),
  active: z.boolean().optional(),
});

export const saveAdminStorySchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof scheduleInput>) => scheduleInput.parse(d))
  .handler(async ({ data, context }) => {
    const payload = {
      user_id: context.userId,
      days: Array.from(new Set(data.days)).sort((a, b) => a - b),
      hours: Array.from(new Set(data.hours)).sort((a, b) => a - b),
      template_id: data.templateId ?? null,
      active: data.active ?? true,
    };
    const { error } = await (context.supabase as any)
      .from("instagram_admin_schedule")
      .upsert(payload, { onConflict: "user_id" });
    if (error) throw error;
    return { ok: true };
  });

