import { createFileRoute } from "@tanstack/react-router";

/**
 * Meta webhook (single-account Instagram Admin).
 * GET  → hub verification.
 * POST → logs and dispatches: comments, DMs, Story replies.
 */
export const Route = createFileRoute("/api/public/meta/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
        if (mode === "subscribe" && expected && token === expected && challenge) {
          return new Response(challenge, { status: 200 });
        }
        return new Response("forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const started = Date.now();
        const bodyText = await request.text();
        let payload: any = null;
        try {
          payload = JSON.parse(bodyText);
        } catch {
          payload = { raw: bodyText };
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await (supabaseAdmin as any).from("instagram_logs").insert({
          type: `webhook_${payload?.object ?? "unknown"}`,
          payload,
        });

        try {
          await handleWebhook(payload, started);
        } catch (e) {
          await (supabaseAdmin as any).from("instagram_logs").insert({
            type: "automation_error",
            payload: { message: (e as Error).message },
            latency_ms: Date.now() - started,
          });
        }

        return new Response("EVENT_RECEIVED", { status: 200 });
      },
    },
  },
});

const DEFAULT_TRIGGERS = ["link", "promoção", "promocao", "promo", "oferta", "cupom", "desconto"];

function matchTrigger(text: string, keyword?: string | null): string | null {
  const lower = text.toLowerCase();
  if (keyword) {
    return lower.includes(keyword.toLowerCase()) ? keyword : null;
  }
  for (const t of DEFAULT_TRIGGERS) if (lower.includes(t)) return t;
  return null;
}

function fillTemplate(tpl: string, vars: Record<string, string>): string {
  let out = tpl || "";
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), v ?? "");
  }
  return out;
}

async function handleWebhook(payload: any, started: number) {
  if (!payload?.entry?.length) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { loadSettings } = await import("@/modules/instagram-admin/settings.server");
  const { sendDirectMessage, replyToComment } = await import(
    "@/modules/instagram-admin/graph.server"
  );

  const settings = await loadSettings();
  if (!settings) return;

  const { data: automations } = await (supabaseAdmin as any)
    .from("instagram_automations")
    .select("id,keyword,message,enabled,product_id,scope")
    .eq("enabled", true);
  const rules: Array<{
    keyword: string;
    message: string;
    product_id: string | null;
    scope: string;
  }> = automations ?? [];

  for (const entry of payload.entry) {
    // ----- DMs & story replies (messaging) -----
    for (const m of entry.messaging ?? []) {
      const text: string = m?.message?.text ?? "";
      const senderId: string = m?.sender?.id ?? "";
      const isStoryReply = !!m?.message?.reply_to?.story;
      const storyId: string | undefined = m?.message?.reply_to?.story?.id;
      if (!text || !senderId || senderId === settings.instagramBusinessId) continue;

      // Story reply: try to match campaign by story_id + trigger words
      if (isStoryReply && storyId) {
        const trig = matchTrigger(text);
        if (trig) {
          const { data: camp } = await (supabaseAdmin as any)
            .from("instagram_campaigns")
            .select("id,product_id,message,affiliate_link,keyword")
            .eq("story_id", storyId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (camp) {
            let productTitle = "";
            if (camp.product_id) {
              const { data: p } = await (supabaseAdmin as any)
                .from("products")
                .select("title,affiliate_link")
                .eq("id", camp.product_id)
                .maybeSingle();
              productTitle = p?.title ?? "";
            }
            const link = camp.affiliate_link ?? "";
            const template =
              camp.message?.trim() ||
              "Olá 👋\n\nSegue sua promoção:\n{{affiliate_link}}";
            const body = fillTemplate(template, {
              affiliate_link: link,
              title: productTitle,
            });
            try {
              await sendDirectMessage({
                igId: settings.instagramBusinessId,
                token: settings.accessToken,
                recipientId: senderId,
                text: body,
              });
              await (supabaseAdmin as any).from("instagram_logs").insert({
                type: "story_reply_auto_dm",
                payload: { to: senderId, storyId, campaignId: camp.id, trigger: trig },
                latency_ms: Date.now() - started,
              });
              continue;
            } catch (e) {
              await (supabaseAdmin as any).from("instagram_logs").insert({
                type: "story_reply_dm_failed",
                payload: { to: senderId, error: (e as Error).message },
              });
            }
          }
        }
      }

      // Generic keyword automations for DMs
      const rule = rules.find(
        (r) =>
          (r.scope === "both" || r.scope === "comment" || r.scope === "message") &&
          matchTrigger(text, r.keyword),
      );
      if (rule) {
        let affiliateLink = "";
        if (rule.product_id) {
          const { data: p } = await (supabaseAdmin as any)
            .from("products")
            .select("affiliate_link,raw_link")
            .eq("id", rule.product_id)
            .maybeSingle();
          affiliateLink = p?.affiliate_link ?? p?.raw_link ?? "";
        }
        const body = fillTemplate(rule.message, { affiliate_link: affiliateLink });
        try {
          await sendDirectMessage({
            igId: settings.instagramBusinessId,
            token: settings.accessToken,
            recipientId: senderId,
            text: body,
          });
          await (supabaseAdmin as any).from("instagram_logs").insert({
            type: "dm_auto_sent",
            payload: { to: senderId, keyword: rule.keyword },
            latency_ms: Date.now() - started,
          });
        } catch (e) {
          await (supabaseAdmin as any).from("instagram_logs").insert({
            type: "dm_auto_failed",
            payload: { to: senderId, error: (e as Error).message },
          });
        }
      }
    }

    // ----- Comments (changes[]) -----
    for (const ch of entry.changes ?? []) {
      if (ch.field !== "comments") continue;
      const v = ch.value ?? {};
      const commentId: string = v.id ?? "";
      const mediaId: string = v.media?.id ?? "";
      const text: string = v.text ?? "";
      const username: string = v.from?.username ?? "";
      const senderId: string = v.from?.id ?? "";
      if (!commentId || !text) continue;

      // persist inbound comment
      await (supabaseAdmin as any).from("instagram_comments").upsert(
        {
          comment_id: commentId,
          media_id: mediaId,
          username,
          comment: text,
        },
        { onConflict: "comment_id" },
      );

      // Try campaign auto-reply first (matches media_id)
      const { data: camp } = await (supabaseAdmin as any)
        .from("instagram_campaigns")
        .select("id,product_id,message,affiliate_link,keyword")
        .eq("story_id", mediaId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let replied = false;
      if (camp && matchTrigger(text, camp.keyword)) {
        try {
          await replyToComment({
            commentId,
            token: settings.accessToken,
            message: "Enviamos no seu direct 📩",
          });
          if (senderId) {
            const body = fillTemplate(camp.message || "{{affiliate_link}}", {
              affiliate_link: camp.affiliate_link ?? "",
            });
            await sendDirectMessage({
              igId: settings.instagramBusinessId,
              token: settings.accessToken,
              recipientId: senderId,
              text: body,
            });
          }
          replied = true;
          await (supabaseAdmin as any).from("instagram_logs").insert({
            type: "comment_auto_replied",
            payload: { commentId, campaignId: camp.id },
            latency_ms: Date.now() - started,
          });
        } catch (e) {
          await (supabaseAdmin as any).from("instagram_logs").insert({
            type: "comment_reply_failed",
            payload: { commentId, error: (e as Error).message },
          });
        }
      }

      if (replied) continue;

      // Fall back to generic keyword automation
      const rule = rules.find(
        (r) =>
          (r.scope === "both" || r.scope === "comment") && matchTrigger(text, r.keyword),
      );
      if (!rule) continue;

      let affiliateLink = "";
      if (rule.product_id) {
        const { data: p } = await (supabaseAdmin as any)
          .from("products")
          .select("affiliate_link,raw_link")
          .eq("id", rule.product_id)
          .maybeSingle();
        affiliateLink = p?.affiliate_link ?? p?.raw_link ?? "";
      }
      const body = fillTemplate(rule.message, { affiliate_link: affiliateLink });
      try {
        await replyToComment({
          commentId,
          token: settings.accessToken,
          message: body.slice(0, 250),
        });
        await (supabaseAdmin as any)
          .from("instagram_comments")
          .update({ reply: body, replied_at: new Date().toISOString() })
          .eq("comment_id", commentId);
        await (supabaseAdmin as any).from("instagram_logs").insert({
          type: "comment_auto_replied",
          payload: { commentId, keyword: rule.keyword },
          latency_ms: Date.now() - started,
        });
      } catch (e) {
        await (supabaseAdmin as any).from("instagram_logs").insert({
          type: "comment_reply_failed",
          payload: { commentId, error: (e as Error).message },
        });
      }
    }
  }
}
