import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/public-auth.server";

/**
 * Recebe a nova URL do Cloudflare Quick Tunnel enviada pelo watcher local
 * (infra/tunnel-watcher). Valida, grava em evolution_settings, ressincroniza
 * webhooks e registra o estado em cloudflare_tunnel_status.
 *
 * POST /api/public/hooks/tunnel-url
 * headers: x-cron-secret: <CRON_SECRET>
 * body: { "url": "https://xxxx.trycloudflare.com" }
 */
export const Route = createFileRoute("/api/public/hooks/tunnel-url")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authError = requireCronSecret(request);
        if (authError) return authError;

        let body: { url?: string } | null = null;
        try {
          body = (await request.json()) as { url?: string };
        } catch {
          return Response.json({ ok: false, error: "JSON inválido" }, { status: 400 });
        }

        const url = String(body?.url ?? "").trim();
        if (!url) {
          return Response.json({ ok: false, error: "campo 'url' é obrigatório" }, { status: 400 });
        }
        if (url.length > 500) {
          return Response.json({ ok: false, error: "url muito longa" }, { status: 400 });
        }

        const { applyNewTunnelUrl } = await import("@/modules/whatsapp/evolution/tunnel.server");
        const result = await applyNewTunnelUrl(url, "watcher");

        return Response.json(result, { status: result.ok ? 200 : 502 });
      },
    },
  },
});
