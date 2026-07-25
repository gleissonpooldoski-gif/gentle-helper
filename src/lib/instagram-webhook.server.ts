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
    if (!conn || !conn.access_token_ciphertext) continue;

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
            igId: conn.instagram_account_id, token, recipientId: fromId,
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
          igId: conn.instagram_account_id, token, recipientId: senderId,
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

function buildProductText(p: any): string {
  const brl = (n: any) => n != null ? `R$ ${Number(n).toFixed(2).replace(".", ",")}` : "";
  const parts = [
    `🔥 ${p.title ?? "Encontrei essa oferta para você!"}`,
    p.original_price ? `De: ${brl(p.original_price)}` : "",
    p.promo_price ? `Por: ${brl(p.promo_price)}` : "",
    "",
    "Toque no botão abaixo 👇",
  ].filter(Boolean);
  return parts.join("\n");
}
