/**
 * Endpoint de DIAGNÓSTICO isolado — Lote 12E.
 *
 * Chama `fetchProductOfferByItem` para um único produto real e devolve o
 * resultado mascarado. Não altera nenhum registro. Não substitui o
 * backfill nem o cron. Removível assim que o Lote 12F for aprovado.
 *
 * Autenticação: CRON_SECRET (mesmo padrão dos demais hooks).
 *
 * Uso:
 *   POST /api/public/hooks/debug-shopee-product
 *   Header: x-cron-secret: <CRON_SECRET>
 *   Body:   { "userId": "...", "itemId": "...", "shopId": "..." }
 */
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/public-auth.server";
import { fetchProductOfferByItem } from "@/modules/shopee-affiliate/client.server";

type Body = {
  userId?: string;
  itemId?: string | number;
  shopId?: string | number | null;
};

export const Route = createFileRoute("/api/public/hooks/debug-shopee-product")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = requireCronSecret(request);
        if (unauthorized) return unauthorized;

        let body: Body = {};
        try {
          body = (await request.json()) as Body;
        } catch {
          return Response.json(
            { ok: false, error: "invalid_json" },
            { status: 400 },
          );
        }
        const userId = String(body.userId ?? "").trim();
        const itemId = body.itemId != null ? String(body.itemId).trim() : "";
        const shopId = body.shopId != null ? String(body.shopId).trim() : null;
        if (!userId || !itemId) {
          return Response.json(
            { ok: false, error: "userId e itemId obrigatórios" },
            { status: 400 },
          );
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const result = await fetchProductOfferByItem(supabaseAdmin, userId, {
          itemId,
          shopId,
        });

        // Máscara: nunca devolver `raw` completo por rede — apenas resumo.
        if (!result.ok) {
          return Response.json({
            ok: false,
            reason: result.reason,
            status: result.status,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
          });
        }
        const { raw: _raw, ...safe } = result.offer;
        return Response.json({
          ok: true,
          reason: result.reason,
          offer: safe,
          rawKeys: _raw ? Object.keys(_raw) : [],
        });
      },
    },
  },
});
