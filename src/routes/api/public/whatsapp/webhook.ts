import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function mapState(state: string | undefined | null) {
  switch ((state ?? "").toLowerCase()) {
    case "open":
      return "connected";
    case "connecting":
      return "awaiting_qr";
    case "close":
    case "closed":
      return "disconnected";
    default:
      return null;
  }
}

/**
 * Webhook público da Evolution API. Aceita eventos QRCODE_UPDATED e CONNECTION_UPDATE.
 * Segurança: valida a apikey global via header antes de gravar.
 */
export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const expected = process.env.EVOLUTION_API_KEY;
        const provided = request.headers.get("apikey");
        if (!expected || provided !== expected) {
          return json({ ok: false, error: "unauthorized" }, 401);
        }

        let payload: any;
        try {
          payload = await request.json();
        } catch {
          return json({ ok: false, error: "invalid_json" }, 400);
        }

        const instanceName: string | undefined =
          payload?.instance ?? payload?.instanceName ?? payload?.data?.instance;
        if (!instanceName) return json({ ok: true, ignored: "no_instance" });

        const event: string = (payload?.event ?? "").toString().toUpperCase();
        const data = payload?.data ?? payload;

        const patch: Record<string, unknown> = {};
        if (event.includes("QRCODE")) {
          const b64 = data?.qrcode?.base64 ?? data?.base64 ?? null;
          if (b64) {
            patch.qr_code = typeof b64 === "string" && b64.startsWith("data:")
              ? b64
              : `data:image/png;base64,${b64}`;
            patch.status = "awaiting_qr";
          }
        } else if (event.includes("CONNECTION")) {
          const st = mapState(data?.state ?? data?.status);
          if (st) {
            patch.status = st;
            if (st === "connected") {
              patch.qr_code = null;
              patch.last_seen_at = new Date().toISOString();
              const owner = data?.wuid ?? data?.owner;
              if (typeof owner === "string") patch.phone = owner.split("@")[0];
            }
          }
        }

        if (Object.keys(patch).length === 0) return json({ ok: true, ignored: event });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("whatsapp_instances")
          .update(patch)
          .eq("instance_name", instanceName);
        if (error) {
          console.error("[WA][WEBHOOK] update error", error.message);
          return json({ ok: false, error: "db_error" }, 500);
        }
        return json({ ok: true, event });
      },
    },
  },
});
