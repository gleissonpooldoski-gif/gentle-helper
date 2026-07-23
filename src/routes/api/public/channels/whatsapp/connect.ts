import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/channels/whatsapp/connect")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let payload: {
          token?: string;
          channel_id?: string;
          browser_id?: string;
          timestamp?: number | string;
        };
        try {
          payload = await request.json();
        } catch {
          console.warn("[WA][CONNECT] invalid json body");
          return json({ ok: false, error: "invalid_json" }, 400);
        }

        const rawToken = (payload.token || "").trim();
        const providedChannelId = (payload.channel_id || "").trim();
        const browserId = (payload.browser_id || "").toString().slice(0, 128);

        // Support pasted format "<token>|<channelId>" as a single string
        let token = rawToken;
        let channelIdFromToken: string | null = null;
        if (rawToken.includes("|")) {
          const [t, c] = rawToken.split("|");
          token = (t || "").trim();
          channelIdFromToken = (c || "").trim() || null;
        }
        const channelId = providedChannelId || channelIdFromToken || "";

        if (!token || !channelId) {
          console.warn("[WA][CONNECT] missing fields", {
            hasToken: Boolean(token),
            hasChannel: Boolean(channelId),
          });
          return json({ ok: false, error: "missing_fields" }, 400);
        }

        const tokenHash = createHash("sha256").update(token).digest("hex");
        const nowIso = new Date().toISOString();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: row, error: selErr } = await supabaseAdmin
          .from("channel_whatsapp_connections")
          .select("id,user_id,channel_id,token_hash")
          .eq("channel_id", channelId)
          .eq("token_hash", tokenHash)
          .maybeSingle();

        if (selErr) {
          console.error("[WA][CONNECT] db select error", selErr.message);
          return json({ ok: false, error: "db_error" }, 500);
        }
        if (!row) {
          console.warn("[WA][CONNECT] token not found for channel", { channelId });
          return json({ ok: false, error: "invalid_token" }, 401);
        }

        const { error: updErr } = await supabaseAdmin
          .from("channel_whatsapp_connections")
          .update({
            status: "connected",
            connected_at: nowIso,
            last_seen_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", row.id);

        if (updErr) {
          console.error("[WA][CONNECT] db update error", updErr.message);
          return json({ ok: false, error: "db_update_error" }, 500);
        }

        console.log("[WA][CONNECT]", {
          channel_id: row.channel_id,
          user_id: row.user_id,
          browser_id: browserId || null,
          status: "connected",
        });

        return json({
          ok: true,
          status: "connected",
          channel_id: row.channel_id,
          connected_at: nowIso,
        });
      },
    },
  },
});
