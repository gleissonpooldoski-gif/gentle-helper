import { createFileRoute } from "@tanstack/react-router";

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

type IncomingStatus = "pending" | "connected" | "disconnected";

export const Route = createFileRoute("/api/public/channels/whatsapp/session-status")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let payload: {
          channel_id?: string;
          status?: IncomingStatus;
          phone_number?: string;
          session_id?: string;
          timestamp?: number | string;
        };
        try {
          payload = await request.json();
        } catch {
          return json({ ok: false, error: "invalid_json" }, 400);
        }

        const channelId = (payload.channel_id || "").trim();
        const status = (payload.status || "").trim() as IncomingStatus;
        const phone = payload.phone_number ? String(payload.phone_number).slice(0, 32) : null;
        const sessionId = payload.session_id ? String(payload.session_id).slice(0, 128) : null;

        if (!channelId || !["pending", "connected", "disconnected"].includes(status)) {
          console.warn("[WA][SESSION] missing/invalid fields", { channelId, status });
          return json({ ok: false, error: "invalid_payload" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: connRow, error: connSelErr } = await supabaseAdmin
          .from("channel_whatsapp_connections")
          .select("user_id,channel_id")
          .eq("channel_id", channelId)
          .maybeSingle();
        if (connSelErr) {
          console.error("[WA][SESSION] db select error", connSelErr.message);
          return json({ ok: false, error: "db_error" }, 500);
        }
        if (!connRow) {
          console.warn("[WA][SESSION] channel not linked", { channelId });
          return json({ ok: false, error: "channel_not_linked" }, 404);
        }

        const nowIso = new Date().toISOString();
        const upsertRow = {
          user_id: connRow.user_id,
          channel_id: connRow.channel_id,
          status,
          phone_number: phone,
          session_id: sessionId,
          connected_at: status === "connected" ? nowIso : null,
          last_seen_at: nowIso,
          updated_at: nowIso,
        };

        const { error: upErr } = await (supabaseAdmin as any)
          .from("channel_whatsapp_session_status")
          .upsert(upsertRow, { onConflict: "user_id,channel_id" });
        if (upErr) {
          console.error("[WA][SESSION] upsert error", upErr.message);
          return json({ ok: false, error: "db_upsert_error" }, 500);
        }

        const { error: connUpdErr } = await supabaseAdmin
          .from("channel_whatsapp_connections")
          .update({
            status: status === "connected" ? "connected" : status === "disconnected" ? "disconnected" : "pending",
            connected_at: status === "connected" ? nowIso : null,
            last_seen_at: nowIso,
            updated_at: nowIso,
          })
          .eq("user_id", connRow.user_id)
          .eq("channel_id", connRow.channel_id);
        if (connUpdErr) {
          console.error("[WA][SESSION] connection update error", connUpdErr.message);
        }

        console.log("[WA][SESSION]", {
          channel_id: connRow.channel_id,
          status,
          phone,
        });

        return json({ ok: true, status, channel_id: connRow.channel_id });
      },
    },
  },
});
