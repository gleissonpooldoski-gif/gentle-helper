import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/public-auth.server";

/**
 * Health-check das instâncias Evolution API a cada 5 min.
 * - Consulta /instance/connectionState/<name> para cada instância registrada
 * - Atualiza whatsapp_instances.status conforme resposta
 * - Se 502/timeout/erro Cloudflare, mantém último status estável (não marca
 *   como desconectado) — o worker já faz isso, aqui só sincroniza a UI.
 */
export const Route = createFileRoute("/api/public/hooks/evolution-healthcheck")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authError = requireCronSecret(request);
        if (authError) return authError;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const evoBase = process.env.EVOLUTION_API_URL;
        const evoKey = process.env.EVOLUTION_API_KEY;
        if (!evoBase || !evoKey) {
          return Response.json({ ok: false, error: "Evolution API não configurada" }, { status: 500 });
        }

        const { data: instances } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id, instance_name, status")
          .not("instance_name", "is", null);

        const rows = (instances ?? []) as Array<{ id: string; instance_name: string; status: string | null }>;
        let checked = 0;
        let flipped = 0;

        for (const inst of rows) {
          try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 6000);
            const r = await fetch(`${evoBase.replace(/\/$/, "")}/instance/connectionState/${encodeURIComponent(inst.instance_name)}`, {
              headers: { apikey: evoKey },
              signal: ctrl.signal,
            });
            clearTimeout(t);
            checked += 1;
            if (!r.ok) continue; // transitório: mantém status atual
            const body = (await r.json().catch(() => null)) as { instance?: { state?: string }; state?: string } | null;
            const state = body?.instance?.state ?? body?.state ?? null;
            const nextStatus = state === "open" ? "connected" : state === "close" ? "disconnected" : state ?? inst.status;
            if (nextStatus && nextStatus !== inst.status) {
              await supabaseAdmin
                .from("whatsapp_instances")
                .update({ status: nextStatus, last_seen_at: new Date().toISOString() })
                .eq("id", inst.id);
              flipped += 1;
            }
          } catch {
            // ignora transitório
          }
        }

        return Response.json({ ok: true, checked, flipped, total: rows.length });
      },
    },
  },
});
