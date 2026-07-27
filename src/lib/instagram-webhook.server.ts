import { decryptToken } from "./instagram-crypto.server";
import { replyToComment, sendDirectMessage } from "./instagram-graph.server";

/**
 * Handles Instagram Graph webhook events. Detects keyword hits in comments
 * and Story replies (DMs), then sends the user a DM with a call-to-action
 * button linking to the current product's affiliate URL.
 */
export async function handleInstagramWebhook(payload: any): Promise<void> {
  if (payload?.object !== "instagram") return;
  const entries: any[] = payload.entry ?? [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  for (const entry of entries) {
    const igAccountId: string = entry.id;
    const { data: conn } = await supabaseAdmin
      .from("instagram_connections")
      .select("*")
      .eq("instagram_account_id", igAccountId)
      .maybeSingle();
    if (!conn || !conn.access_token_ciphertext || !conn.instagram_account_id) continue;
    const igId: string = conn.instagram_account_id;
    const token = decryptToken(conn.access_token_ciphertext);

    // COMMENTS
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;
      const v = change.value ?? {};
      const text = String(v.text ?? "").toLowerCase();
      const commentId = v.id;
      const fromId = v.from?.id;
      const mediaId = v.media?.id;
      await supabaseAdmin.from("instagram_events").insert({
        user_id: conn.user_id, connection_id: conn.id, channel_id: conn.channel_id,
        kind: "comment", payload: v,
      });

      // ---- InstaBotHelp (per-media automation) has priority ----
      if (mediaId) {
        const handled = await tryInstabot({
          supabaseAdmin, conn, igId, token,
          mediaId, commentId, fromId, username: v.from?.username ?? null, text,
        });
        if (handled) continue;
      }

      const kw = await matchKeyword(supabaseAdmin, conn.channel_id, text);
      if (!kw) continue;
      const product = await pickProduct(supabaseAdmin, conn.channel_id, mediaId);
      if (!product) continue;

      if (kw.comment_reply_enabled && !conn.disable_comment_reply && commentId) {
        try { await replyToComment({ commentId, token, message: kw.comment_reply_text }); } catch (e) { console.error(e); }
      }
      if (fromId) {
        try {
          await sendDirectMessage({
            igId: igId, token, recipientId: fromId,
            text: buildProductText(product),
            buttonUrl: (product.affiliate_link ?? product.raw_link) || undefined,
            buttonTitle: "VER PARA COMPRAR",
          });
          await supabaseAdmin.from("instagram_events").insert({
            user_id: conn.user_id, connection_id: conn.id, channel_id: conn.channel_id,
            product_id: product.id, kind: "dm_sent", payload: { via: "comment", commentId },
          });
        } catch (e) { console.error("dm-fail", e); }
      }
    }

    // STORY REPLIES / DMs
    for (const msg of entry.messaging ?? []) {
      const senderId = msg.sender?.id;
      const text = String(msg.message?.text ?? "").toLowerCase();
      if (!senderId || !text) continue;
      await supabaseAdmin.from("instagram_events").insert({
        user_id: conn.user_id, connection_id: conn.id, channel_id: conn.channel_id,
        kind: "story_reply", payload: msg,
      });
      const kw = await matchKeyword(supabaseAdmin, conn.channel_id, text);
      if (!kw) continue;
      const product = await pickProduct(supabaseAdmin, conn.channel_id, null);
      if (!product) continue;
      try {
        await sendDirectMessage({
          igId: igId, token, recipientId: senderId,
          text: buildProductText(product),
          buttonUrl: (product.affiliate_link ?? product.raw_link) || undefined,
          buttonTitle: "VER PARA COMPRAR",
        });
        await supabaseAdmin.from("instagram_events").insert({
          user_id: conn.user_id, connection_id: conn.id, channel_id: conn.channel_id,
          product_id: product.id, kind: "dm_sent", payload: { via: "story_reply" },
        });
      } catch (e) { console.error("dm-fail", e); }
    }
  }
}

async function matchKeyword(db: any, channelId: string, text: string) {
  const { data: rows } = await db
    .from("instagram_keywords")
    .select("id,keyword,active,comment_reply_enabled,comment_reply_text")
    .eq("channel_id", channelId).eq("active", true);
  for (const kw of rows ?? []) {
    const k = String(kw.keyword).toLowerCase();
    if (!k) continue;
    if (new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)) return kw;
  }
  return null;
}

async function pickProduct(db: any, channelId: string, mediaId: string | null | undefined) {
  if (mediaId) {
    const { data: prev } = await db.from("instagram_posts")
      .select("product_id").eq("instagram_media_id", mediaId).maybeSingle();
    if (prev?.product_id) {
      const { data: p } = await db.from("products").select("*").eq("id", prev.product_id).maybeSingle();
      if (p) return p;
    }
  }
  const { data: p } = await db.from("products")
    .select("*").eq("channel_id", channelId).eq("availability", "active")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return p;
}

async function buildProductText(p: any): Promise<string> {
  const brl = (n: any) => n != null ? `R$ ${Number(n).toFixed(2).replace(".", ",")}` : "";
  // LOTE 18A: DE/POR e vendas decididos EXCLUSIVAMENTE pela camada central.
  const { resolveProductDisplay } = await import("@/modules/products/display-resolver");
  const disp = resolveProductDisplay({
    title: p?.title ?? null,
    platform: p?.platform ?? null,
    promo_price: p?.promo_price ?? null,
    original_price: p?.original_price ?? null,
    sales_historical: p?.sales_historical ?? null,
    sales_source: p?.sales_source ?? null,
    price_quality: p?.price_quality ?? null,
  });
  const promo = disp.priceCurrentDisplay ?? p?.promo_price ?? p?.original_price ?? null;
  const original = disp.priceOriginalDisplay;
  const parts = [
    `🔥 ${p?.title ?? "Encontrei essa oferta para você!"}`,
    original != null ? `De: ${brl(original)}` : "",
    promo != null ? `Por: ${brl(promo)}` : "",
    disp.salesLabel ? `🛒 ${disp.salesLabel}` : "",
    "",
    "Toque no botão abaixo 👇",
  ].filter(Boolean);
  return parts.join("\n");
}

async function tryInstabot(input: {
  supabaseAdmin: any;
  conn: any;
  igId: string;
  token: string;
  mediaId: string;
  commentId: string | null | undefined;
  fromId: string | null | undefined;
  username: string | null | undefined;
  text: string;
}): Promise<boolean> {
  const { supabaseAdmin, conn, igId, token, mediaId, commentId, fromId, username, text } = input;
  const { data: auto } = await supabaseAdmin
    .from("instabot_automations")
    .select("*")
    .eq("channel_id", conn.channel_id)
    .eq("ig_media_id", mediaId)
    .eq("enabled", true)
    .maybeSingle();
  if (!auto) return false;

  const kws: string[] = (auto.keywords ?? []).map((s: string) => s.toLowerCase());
  const t = String(text ?? "").toLowerCase();
  const hit = kws.some((k) => {
    if (!k) return false;
    return new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t);
  });
  if (!hit) return false;

  let commentReply: string | null = null;
  const mode = auto.comment_reply_mode ?? "list";
  if (mode === "auto") {
    commentReply = await aiCommentReply(text).catch(() => null);
  }
  if (!commentReply) {
    const list: string[] = (auto.comment_replies ?? []).filter(Boolean);
    if (list.length) commentReply = list[Math.floor(Math.random() * list.length)];
  }
  if (commentReply && commentId && !conn.disable_comment_reply) {
    try { await replyToComment({ commentId, token, message: commentReply }); } catch (e) { console.error(e); }
  }

  // Insert event first so we get an id for the trackable button
  const { data: ev } = await supabaseAdmin
    .from("instabot_events")
    .insert({
      user_id: conn.user_id,
      automation_id: auto.id,
      channel_id: conn.channel_id,
      ig_user_id: fromId ?? null,
      ig_username: username ?? null,
      comment_id: commentId ?? null,
      comment_text: text,
      comment_reply: commentReply,
      dm_sent: false,
      dm_message: auto.dm_message,
      button_url: auto.button_url,
      status: "ok",
    })
    .select("id")
    .single();

  if (fromId) {
    const host = process.env.PUBLIC_BASE_URL ?? "https://project--c8d0a9f8-2712-4d4d-b2f8-6b9530849b41.lovable.app";
    const trackable = ev?.id ? `${host}/api/public/instabot/r/${ev.id}` : auto.button_url;
    try {
      await sendDirectMessage({
        igId, token, recipientId: fromId,
        text: auto.dm_message || "Confira o produto abaixo 👇",
        buttonUrl: trackable,
        buttonTitle: (auto.button_label || "VER PRODUTO").slice(0, 20),
      });
      if (ev?.id) {
        await supabaseAdmin.from("instabot_events").update({ dm_sent: true }).eq("id", ev.id);
      }
    } catch (e) {
      console.error("instabot-dm-fail", e);
      if (ev?.id) {
        await supabaseAdmin
          .from("instabot_events")
          .update({ status: "error", error: String(e) })
          .eq("id", ev.id);
      }
    }
  }
  return true;
}

async function aiCommentReply(commentText: string): Promise<string | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      messages: [
        { role: "system", content: "Responda comentários de Instagram em português, curto (máx 60 caracteres), simpático, avisando que enviou no Direct. Sem hashtags. Só a frase." },
        { role: "user", content: `Comentário: ${commentText}` },
      ],
    }),
  });
  if (!res.ok) return null;
  const body: any = await res.json().catch(() => ({}));
  const txt = body?.choices?.[0]?.message?.content;
  return typeof txt === "string" ? txt.trim().slice(0, 100) : null;
}
