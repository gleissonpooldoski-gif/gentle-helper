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

function hashToken(t: string): string {
  return createHash("sha256").update(t).digest("hex");
}

export const Route = createFileRoute("/api/public/whatsapp/connect")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let payload: { token?: string; browser_id?: string };
        try {
          payload = await request.json();
        } catch {
          return json({ ok: false, error: "invalid_json" }, 400);
        }

        const token = String(payload.token ?? "").trim();
        const browserId = String(payload.browser_id ?? "").slice(0, 128);

        if (!token) return json({ ok: false, error: "missing_token" }, 400);
        if (!browserId) return json({ ok: false, error: "missing_browser_id" }, 400);

        const tokenHash = hashToken(token);
        const nowIso = new Date().toISOString();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: row, error: selErr } = await supabaseAdmin
          .from("whatsapp_sessions")
          .select("id,user_id,status,expires_at")
          .eq("token_hash", tokenHash)
          .maybeSingle();

        if (selErr) {
          console.error("[WA][CONNECT] db select error", selErr.message);
          return json({ ok: false, error: "db_error" }, 500);
        }
        if (!row) return json({ ok: false, error: "invalid_token" }, 401);

        if (row.expires_at && new Date(row.expires_at).getTime() < Date.now() && row.status !== "connected") {
          return json({ ok: false, error: "token_expired" }, 401);
        }

        const { error: updErr } = await supabaseAdmin
          .from("whatsapp_sessions")
          .update({
            status: "connected",
            browser_id: browserId,
            connected_at: row.status === "connected" ? undefined : nowIso,
            last_seen_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", row.id);

        if (updErr) {
          console.error("[WA][CONNECT] db update error", updErr.message);
          return json({ ok: false, error: "db_update_error" }, 500);
        }

        console.log("[WA][CONNECT]", {
          session_id: row.id,
          user_id: row.user_id,
          browser_id: browserId,
        });

        return json({
          ok: true,
          status: "connected",
          session_id: row.id,
          connected_at: nowIso,
        });
      },
    },
  },
});
