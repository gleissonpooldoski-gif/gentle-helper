import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/public-auth.server";

/**
 * ETAPA 3 — Reaper genérico do sistema.
 *
 * Recupera registros abandonados em filas/hooks e faz manutenção da DLQ
 * (`automation_failures`). Somente transições de ESTADO: não envia nada,
 * não cria nem apaga claims, não toca em Evolution nem em envio manual.
 * Executa via pg_cron.
 */
export const Route = createFileRoute("/api/public/hooks/system-reaper")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFail = requireCronSecret(request);
        if (authFail) return authFail;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runSystemReaper } = await import("@/modules/reliability/reaper.server");

        try {
          const report = await runSystemReaper(supabaseAdmin);
          return Response.json({ ok: true, ...report });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error("[SYSTEM_REAPER] " + JSON.stringify({ event: "REAPER_FAILED", error: message }));
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
