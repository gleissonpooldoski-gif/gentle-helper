/**
 * Lote 15E.3 — Endpoint dedicado à execução FULL da reparação Shopee.
 * Protegido por `x-cron-secret`. Retorna resumo agregado com paginação
 * completa (independente do limite de 1000 do Supabase).
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/shopee-repair-v2")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        const provided = request.headers.get("x-cron-secret");
        if (!secret || provided !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        let body: {
          user_id?: string;
          mode?: "pilot" | "full";
          offset?: number;
          limit?: number;
        } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "invalid_json" }, { status: 400 });
        }
        const userId = String(body.user_id ?? "").trim();
        if (!userId) {
          return Response.json({ error: "missing_user_id" }, { status: 400 });
        }
        const offset = Math.max(0, Number(body.offset ?? 0));
        const limit = Math.max(1, Math.min(Number(body.limit ?? 1000), 1000));

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { repairShopeeProducts, hasAffiliateCredentials } = await import(
          "@/modules/shopee-affiliate/repair.server"
        );

        if (!(await hasAffiliateCredentials(supabaseAdmin, userId))) {
          return Response.json(
            { error: "missing_affiliate_credentials" },
            { status: 400 },
          );
        }

        // Busca a fatia solicitada diretamente para evitar o limite de 1000 do PostgREST.
        const { data: page, error: pageError } = await supabaseAdmin
          .from("products")
          .select(
            "id, title, item_id, raw_link, promo_price, original_price, sales, sales_label",
          )
          .eq("user_id", userId)
          .eq("platform", "shopee")
          .order("id", { ascending: true })
          .range(offset, offset + limit - 1);
        if (pageError) {
          return Response.json(
            { error: "products_query_failed", message: pageError.message },
            { status: 500 },
          );
        }
        const ids = (page ?? []).map((p) => p.id as string);
        if (ids.length === 0) {
          return Response.json({
            total: 0,
            offset,
            limit,
            byStatus: {},
            salesRecovered: 0,
            originalFilled: 0,
            reasonBreakdown: {},
            topImpacts: [],
          });
        }

        // Reaproveita repairShopeeProducts em modo "full" mas restringe via lista.
        // Como o motor atual não aceita lista, chamamos diretamente `repairOne`
        // através de um wrapper local usando os produtos já buscados.
        const { repairOneExposed } = await import(
          "@/modules/shopee-affiliate/repair.server"
        );

        const records: Awaited<ReturnType<typeof repairOneExposed>>[] = [];
        const concurrency = 3;
        let cursor = 0;
        const worker = async () => {
          while (cursor < page!.length) {
            const idx = cursor++;
            try {
              records.push(await repairOneExposed(supabaseAdmin, userId, page![idx] as unknown as never));
            } catch (e) {
              records.push({
                productId: page![idx].id as string,
                itemId: (page![idx] as { item_id: string | null }).item_id,
                title: (page![idx] as { title: string | null }).title,
                oldSales: (page![idx] as { sales: number | null }).sales,
                newSales: null,
                oldPrice: (page![idx] as { promo_price: number | null }).promo_price,
                newPrice: null,
                oldOriginal: (page![idx] as { original_price: number | null }).original_price,
                newOriginal: null,
                status: "api_error",
                reason: e instanceof Error ? e.message : String(e),
              });
            }
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(concurrency, page!.length) }, worker),
        );

        // Evitar aviso de unused
        void repairShopeeProducts;

        const byStatus: Record<string, number> = {};
        const reasonBreakdown: Record<string, number> = {};
        let salesRecovered = 0;
        let originalFilled = 0;
        for (const r of records) {
          byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
          const key = `${r.status}:${r.reason ?? ""}`;
          reasonBreakdown[key] = (reasonBreakdown[key] ?? 0) + 1;
          if (
            typeof r.newSales === "number" &&
            typeof r.oldSales === "number" &&
            r.newSales > r.oldSales
          ) {
            salesRecovered += r.newSales - r.oldSales;
          }
          if (r.oldOriginal == null && r.newOriginal != null) {
            originalFilled += 1;
          }
        }
        const topImpacts = [...records]
          .filter(
            (r) =>
              typeof r.newSales === "number" &&
              typeof r.oldSales === "number" &&
              r.newSales > r.oldSales,
          )
          .sort(
            (a, b) => (b.newSales! - b.oldSales!) - (a.newSales! - a.oldSales!),
          )
          .slice(0, 20)
          .map((r) => ({
            productId: r.productId,
            title: r.title?.slice(0, 60) ?? null,
            oldSales: r.oldSales,
            newSales: r.newSales,
            oldOriginal: r.oldOriginal,
            newOriginal: r.newOriginal,
            status: r.status,
          }));
        void ids;
        return Response.json({
          total: records.length,
          offset,
          limit,
          byStatus,
          salesRecovered,
          originalFilled,
          reasonBreakdown,
          topImpacts,
        });
      },
    },
  },
});
