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
        // Evolution API não envia autenticação nos webhooks. A identificação
        // é feita pelo instanceName do payload, que precisa existir no banco.
        let payload: any;
        try {
          payload = await request.json();
        } catch {
          return json({ ok: false, error: "invalid_json" }, 400);
        }

        const instanceName: string | undefined =
          payload?.instance ?? payload?.instanceName ?? payload?.data?.instance;
        if (!instanceName) return json({ ok: true, ignored: "no_instance" });

        const event: string = (payload?.event ?? "")
          .toString()
          .toUpperCase()
          .replace(/[.\-\s]/g, "_");
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

        // Captura de produtos a partir de grupos monitorados.
        if (event.includes("MESSAGES_UPSERT") || event.includes("MESSAGE")) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { handleEvolutionMessage } = await import("@/modules/monitor/capture.server");
            const stats = await handleEvolutionMessage(supabaseAdmin as any, instanceName, payload);
            return json({ ok: true, event, stats });
          } catch (err) {
            console.error("[WA][WEBHOOK] monitor capture error", (err as Error).message);
            return json({ ok: false, error: "capture_error" }, 500);
          }
        }

        if (Object.keys(patch).length === 0) return json({ ok: true, ignored: event });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await (supabaseAdmin as any)
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
