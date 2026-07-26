/**
 * Lote 15E.4 — Segunda varredura: retry apenas dos produtos que provavelmente
 * ficaram sem reparo (api_error / not_found temporário).
 *
 * Heurística de candidato (sem persistir status): produto Shopee do usuário com
 * `sales <= 998` E `original_price IS NULL`. Esse é o footprint deixado pelos
 * itens que não conseguiram enriquecer via API na primeira/segunda passada.
 *
 * Controles anti rate-limit:
 *  - concurrency = 1 (padrão), configurável até 2;
 *  - `delayMs` entre chamadas (default 400ms);
 *  - retry local por produto com backoff exponencial em erros transitórios
 *    (network_error / api_error / not_found), até `retries` (default 2).
 *
 * Regras de negócio permanecem em `repairOne`:
 *  - sales só cresce;
 *  - price-guard obrigatório;
 *  - original_price apenas com desconto real.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/shopee-repair-retry")({
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
          offset?: number;
          limit?: number;
          delay_ms?: number;
          retries?: number;
          concurrency?: number;
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
        const limit = Math.max(1, Math.min(Number(body.limit ?? 500), 1000));
        const delayMs = Math.max(0, Math.min(Number(body.delay_ms ?? 400), 5000));
        const retries = Math.max(0, Math.min(Number(body.retries ?? 2), 4));
        const concurrency = Math.max(1, Math.min(Number(body.concurrency ?? 1), 2));

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { hasAffiliateCredentials, repairOneExposed } = await import(
          "@/modules/shopee-affiliate/repair.server"
        );

        if (!(await hasAffiliateCredentials(supabaseAdmin, userId))) {
          return Response.json(
            { error: "missing_affiliate_credentials" },
            { status: 400 },
          );
        }

        // Candidatos: assinatura típica dos que não foram enriquecidos ainda.
        const { data: page, error: pageError } = await supabaseAdmin
          .from("products")
          .select(
            "id, title, item_id, raw_link, promo_price, original_price, sales, sales_label",
          )
          .eq("user_id", userId)
          .eq("platform", "shopee")
          .lte("sales", 998)
          .is("original_price", null)
          .order("id", { ascending: true })
          .range(offset, offset + limit - 1);
        if (pageError) {
          return Response.json(
            { error: "products_query_failed", message: pageError.message },
            { status: 500 },
          );
        }
        const products = page ?? [];
        if (products.length === 0) {
          return Response.json({
            total: 0,
            offset,
            limit,
            byStatus: {},
            reasonBreakdown: {},
            salesRecovered: 0,
            originalFilled: 0,
            priceBlocked: 0,
            stillApiError: 0,
          });
        }

        const sleep = (ms: number) =>
          ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve();

        type Rec = Awaited<ReturnType<typeof repairOneExposed>>;
        const records: Rec[] = [];
        let cursor = 0;

        const runOne = async (p: (typeof products)[number]): Promise<Rec> => {
          let last: Rec | null = null;
          for (let attempt = 0; attempt <= retries; attempt++) {
            const rec = await repairOneExposed(
              supabaseAdmin,
              userId,
              p as unknown as never,
            );
            last = rec;
            if (rec.status !== "api_error" && rec.status !== "not_found") {
              return rec;
            }
            // backoff exponencial: 800ms, 1600ms, 3200ms...
            const backoff = 800 * Math.pow(2, attempt);
            await sleep(backoff);
          }
          return last!;
        };

        const worker = async () => {
          while (cursor < products.length) {
            const idx = cursor++;
            const p = products[idx];
            try {
              const rec = await runOne(p);
              records.push(rec);
            } catch (e) {
              records.push({
                productId: p.id as string,
                itemId: (p as { item_id: string | null }).item_id,
                title: (p as { title: string | null }).title,
                oldSales: (p as { sales: number | null }).sales,
                newSales: (p as { sales: number | null }).sales,
                oldPrice: (p as { promo_price: number | null }).promo_price,
                newPrice: (p as { promo_price: number | null }).promo_price,
                oldOriginal: (p as { original_price: number | null }).original_price,
                newOriginal: (p as { original_price: number | null }).original_price,
                status: "api_error",
                reason: e instanceof Error ? e.message : String(e),
              });
            }
            if (cursor < products.length) await sleep(delayMs);
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(concurrency, products.length) }, worker),
        );

        const byStatus: Record<string, number> = {};
        const reasonBreakdown: Record<string, number> = {};
        let salesRecovered = 0;
        let originalFilled = 0;
        let priceBlocked = 0;
        let stillApiError = 0;
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
          if (r.oldOriginal == null && r.newOriginal != null) originalFilled += 1;
          if (r.status === "price_blocked") priceBlocked += 1;
          if (r.status === "api_error" || r.status === "not_found") stillApiError += 1;
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

        console.log(
          "[SHOPEE_REPAIR_RETRY:summary]",
          JSON.stringify({
            userId,
            offset,
            limit,
            total: records.length,
            byStatus,
            salesRecovered,
            originalFilled,
            priceBlocked,
            stillApiError,
          }),
        );

        return Response.json({
          total: records.length,
          offset,
          limit,
          delayMs,
          retries,
          concurrency,
          byStatus,
          reasonBreakdown,
          salesRecovered,
          originalFilled,
          priceBlocked,
          stillApiError,
          topImpacts,
        });
      },
    },
  },
});
