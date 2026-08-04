import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/public-auth.server";

/**
 * Health check do túnel + Evolution API (rodar a cada 60s via pg_cron).
 * Testa GET {EVOLUTION_URL}/instance/fetchInstances e classifica:
 *  200/401/403 -> ONLINE | 404 -> ERROR (config) | 530/522/523/524 -> OFFLINE
 */
export const Route = createFileRoute("/api/public/hooks/tunnel-health")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authError = requireCronSecret(request);
        if (authError) return authError;

        const { runTunnelHealthCheck } = await import("@/modules/whatsapp/evolution/tunnel.server");
        const result = await runTunnelHealthCheck();
        return Response.json({ ok: result.status === "ONLINE", ...result });
      },
    },
  },
});
