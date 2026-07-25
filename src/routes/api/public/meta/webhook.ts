import { createFileRoute } from "@tanstack/react-router";

/**
 * Meta webhook (single-account Instagram Admin).
 * GET  → hub verification (echoes hub.challenge if hub.verify_token matches).
 * POST → logs the raw payload and dispatches keyword-based DM automations.
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
        const bodyText = await request.text();
        let payload: any = null;
        try {
          payload = JSON.parse(bodyText);
        } catch {
          payload = { raw: bodyText };
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // log everything
        await (supabaseAdmin as any).from("instagram_logs").insert({
          type: payload?.object ?? "unknown",
          payload,
        });

        try {
          await handleDmAutomations(payload);
        } catch (e) {
          await (supabaseAdmin as any).from("instagram_logs").insert({
            type: "automation_error",
            payload: { message: (e as Error).message },
          });
        }

        return new Response("EVENT_RECEIVED", { status: 200 });
      },
    },
  },
});

async function handleDmAutomations(payload: any) {
  if (!payload?.entry?.length) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { loadSettings } = await import("@/modules/instagram-admin/settings.server");
  const { sendDirectMessage } = await import("@/modules/instagram-admin/graph.server");

  const settings = await loadSettings();
  if (!settings) return;

  const { data: automations } = await (supabaseAdmin as any)
    .from("instagram_automations")
    .select("keyword,message,enabled")
    .eq("enabled", true);
  const rules: Array<{ keyword: string; message: string }> = automations ?? [];
  if (!rules.length) return;

  for (const entry of payload.entry) {
    const messaging = entry.messaging ?? [];
    for (const m of messaging) {
      const text: string = m?.message?.text ?? "";
      const senderId: string = m?.sender?.id ?? "";
      // ignore echoes from the business itself
      if (!text || !senderId || senderId === settings.instagramBusinessId) continue;
      const lower = text.toLowerCase();
      const rule = rules.find((r) => lower.includes(r.keyword));
      if (!rule) continue;
      const reply = rule.message.replace(/\{\{affiliate_link\}\}/g, "");
      try {
        await sendDirectMessage({
          igId: settings.instagramBusinessId,
          token: settings.accessToken,
          recipientId: senderId,
          text: reply,
        });
        await (supabaseAdmin as any).from("instagram_logs").insert({
          type: "dm_auto_sent",
          payload: { to: senderId, keyword: rule.keyword },
        });
      } catch (e) {
        await (supabaseAdmin as any).from("instagram_logs").insert({
          type: "dm_auto_failed",
          payload: { to: senderId, error: (e as Error).message },
        });
      }
    }
  }
}
