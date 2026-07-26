import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/public-auth.server";

/**
 * Cron diário: busca produtos Shopee sem `original_price` e enriquece via
 * Shopee Affiliate Open API (Lote 12F). Substitui o PDP público, que está
 * bloqueado por bot-detection (`error 90309999`).
 *
 * Política de preço:
 *   Fonte 1 — `originalPrice` real da API (se > promo).
 *   Fonte 2 — derivação a partir de `priceDiscountRate` (>0 e <100).
 *   Caso contrário → nunca grava `original_price`.
 *
 * Processa até 100 produtos por execução (concurrency 4). Uma execução do
 * cron só toca produtos de usuários que possuem credenciais Shopee
 * (`affiliate_connections.platform='shopee'`). Credenciais são cacheadas
 * por usuário durante a execução.
 */
export const Route = createFileRoute("/api/public/hooks/price-backfill")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authError = requireCronSecret(request);
        if (authError) return authError;

        const startedAt = Date.now();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const {
          fetchProductOfferByItem,
          parseShopeeIds,
          deriveOriginalFromOffer,
        } = await import("@/modules/shopee-affiliate/client.server");
        const { validateShopeePriceUpdate } = await import(
          "@/modules/shopee-affiliate/price-guard"
        );

        const { data: candidates } = await supabaseAdmin
          .from("products")
          .select("id, user_id, channel_id, raw_link, affiliate_link, item_id, promo_price")
          .eq("platform", "shopee")
          .is("original_price", null)
          .not("promo_price", "is", null)
          .order("updated_at", { ascending: true })
          .limit(100);

        const rows = (candidates ?? []) as Array<{
          id: string;
          user_id: string;
          channel_id: string | null;
          raw_link: string | null;
          affiliate_link: string | null;
          item_id: string | null;
          promo_price: number | null;
        }>;

        let updated = 0;
        let skipped = 0;
        let apiErrors = 0;
        let apiRealField = 0;
        let apiDerived = 0;
        const reasons: Record<string, number> = {};
        const bump = (k: string) => {
          reasons[k] = (reasons[k] ?? 0) + 1;
        };

        function resolveIds(row: (typeof rows)[number]) {
          const fromLink = parseShopeeIds(row.raw_link ?? row.affiliate_link ?? null);
          if (fromLink) return fromLink;
          if (row.item_id) {
            const parts = String(row.item_id).split(".");
            if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
              return { shopId: parts[0], itemId: parts[1] };
            }
            if (/^\d+$/.test(String(row.item_id))) {
              return { shopId: null as string | null, itemId: String(row.item_id) };
            }
          }
          return null;
        }

        const CONCURRENCY = 4;
        for (let i = 0; i < rows.length; i += CONCURRENCY) {
          const slice = rows.slice(i, i + CONCURRENCY);
          await Promise.all(
            slice.map(async (r) => {
              const ids = resolveIds(r);
              if (!ids) {
                bump("no_link");
                skipped += 1;
                console.log(
                  "[SHOPEE_API_PRICE_SYNC]",
                  JSON.stringify({
                    productId: r.id,
                    itemId: null,
                    status: "skipped",
                    reason: "no_link",
                    promoPrice: r.promo_price,
                    originalPrice: null,
                    source: null,
                  }),
                );
                return;
              }
              try {
                const res = await fetchProductOfferByItem(supabaseAdmin, r.user_id, {
                  itemId: ids.itemId,
                  shopId: ids.shopId,
                });
                if (!res.ok) {
                  apiErrors += 1;
                  bump(`api_${res.reason}`);
                  skipped += 1;
                  console.log(
                    "[SHOPEE_API_PRICE_SYNC]",
                    JSON.stringify({
                      productId: r.id,
                      itemId: ids.itemId,
                      status: "skipped",
                      reason: `api_${res.reason}`,
                      promoPrice: r.promo_price,
                      originalPrice: null,
                      source: null,
                    }),
                  );
                  return;
                }
                const promo = Number(r.promo_price) || res.offer.price || 0;
                const { originalPrice, source } = deriveOriginalFromOffer({
                  price: promo,
                  originalPrice: res.offer.originalPrice,
                  discountRate: res.offer.discountRate,
                });
                let reason: string;
                if (promo <= 0) reason = "no_promo";
                else if (originalPrice == null) reason = "no_discount";
                else reason = "ok_discount";
                bump(reason);

                const logRow = {
                  productId: r.id,
                  itemId: ids.itemId,
                  status: reason === "ok_discount" ? "updated" : "skipped",
                  reason,
                  promoPrice: promo,
                  originalPrice,
                  source,
                };
                console.log("[SHOPEE_API_PRICE_SYNC]", JSON.stringify(logRow));

                if (reason === "ok_discount" && originalPrice != null) {
                  const discount = Math.round(((originalPrice - promo) / originalPrice) * 100);
                  await supabaseAdmin
                    .from("products")
                    .update({
                      original_price: originalPrice,
                      discount_percentage: discount,
                      is_discount: true,
                      updated_at: new Date().toISOString(),
                    })
                    .eq("id", r.id);
                  updated += 1;
                  if (source === "api_real_field") apiRealField += 1;
                  else if (source === "derived_from_discount_rate") apiDerived += 1;
                } else {
                  skipped += 1;
                }
              } catch (e) {
                apiErrors += 1;
                bump("network_error");
                skipped += 1;
                console.log(
                  "[SHOPEE_API_PRICE_SYNC]",
                  JSON.stringify({
                    productId: r.id,
                    itemId: ids.itemId,
                    status: "error",
                    reason: "network_error",
                    error: e instanceof Error ? e.message : String(e),
                  }),
                );
              }
            }),
          );
        }

        const durationMs = Date.now() - startedAt;
        const avgMs = rows.length > 0 ? Math.round(durationMs / rows.length) : 0;
        console.log(
          "[SHOPEE_API_PRICE_SYNC:summary]",
          JSON.stringify({
            total: rows.length,
            updated,
            skipped,
            apiErrors,
            apiRealField,
            apiDerived,
            avgMs,
            reasons,
          }),
        );
        return Response.json({
          ok: true,
          total: rows.length,
          updated,
          skipped,
          apiErrors,
          apiRealField,
          apiDerived,
          avgMs,
          reasons,
        });
      },
    },
  },
});
