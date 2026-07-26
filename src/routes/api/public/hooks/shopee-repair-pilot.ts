/**
 * Lote 15E.2 — Endpoint temporário para execução do piloto Shopee Repair.
 *
 * Protegido por header `x-cron-secret` (mesma chave do automation-tick).
 * Recebe `user_id` no body e roda `repairShopeeProducts` no modo indicado
 * (default: "pilot"). Retorna o resumo completo para o relatório.
 *
 * NÃO expõe segredos. NÃO altera outros fluxos.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/shopee-repair-pilot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        const provided = request.headers.get("x-cron-secret");
        if (!secret || provided !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        let body: { user_id?: string; mode?: "pilot" | "full" } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "invalid_json" }, { status: 400 });
        }
        const userId = String(body.user_id ?? "").trim();
        const mode = body.mode === "full" ? "full" : "pilot";
        if (!userId) {
          return Response.json({ error: "missing_user_id" }, { status: 400 });
        }
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { repairShopeeProducts } = await import(
          "@/modules/shopee-affiliate/repair.server"
        );
        try {
          const summary = await repairShopeeProducts(
            supabaseAdmin,
            userId,
            { mode },
          );
          return Response.json({
            mode: summary.mode,
            total: summary.total,
            byStatus: summary.byStatus,
            sample: summary.records.slice(0, 20).map((r) => ({
              productId: r.productId,
              title: r.title?.slice(0, 60) ?? null,
              oldSales: r.oldSales,
              newSales: r.newSales,
              oldPrice: r.oldPrice,
              newPrice: r.newPrice,
              oldOriginal: r.oldOriginal,
              newOriginal: r.newOriginal,
              status: r.status,
              reason: r.reason,
            })),
          });
        } catch (error) {
          return Response.json(
            {
              error: "repair_failed",
              message:
                error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
