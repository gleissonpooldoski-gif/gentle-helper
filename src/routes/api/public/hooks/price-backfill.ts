import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/public-auth.server";

/**
 * Cron diário: busca produtos Shopee sem original_price e enriquece via PDP.
 * Roda 1x/dia. Processa até 80 produtos por execução (10 canais × 8) para
 * respeitar rate-limit da Shopee.
 */
export const Route = createFileRoute("/api/public/hooks/price-backfill")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authError = requireCronSecret(request);
        if (authError) return authError;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { fetchShopeePdp } = await import("@/modules/monitor/capture.server");

        const { data: candidates } = await supabaseAdmin
          .from("products")
          .select("id, channel_id, raw_link, affiliate_link, promo_price")
          .eq("platform", "shopee")
          .is("original_price", null)
          .not("promo_price", "is", null)
          .order("updated_at", { ascending: true })
          .limit(80);

        const rows = (candidates ?? []) as Array<{
          id: string;
          channel_id: string | null;
          raw_link: string | null;
          affiliate_link: string | null;
          promo_price: number | null;
        }>;

        let updated = 0;
        let skipped = 0;

        // Concurrency 4 para não sobrecarregar a Shopee.
        const CONCURRENCY = 4;
        for (let i = 0; i < rows.length; i += CONCURRENCY) {
          const slice = rows.slice(i, i + CONCURRENCY);
          await Promise.all(
            slice.map(async (r) => {
              const link = r.raw_link || r.affiliate_link;
              if (!link) return;
              try {
                const pdp = await fetchShopeePdp(link);
                const promo = Number(r.promo_price) || 0;
                const original = Number(pdp?.priceBefore ?? 0) || 0;
                if (original > promo && promo > 0) {
                  const discount = Math.round(((original - promo) / original) * 100);
                  await supabaseAdmin
                    .from("products")
                    .update({
                      original_price: original,
                      discount_percentage: discount,
                      is_discount: true,
                      updated_at: new Date().toISOString(),
                    })
                    .eq("id", r.id);
                  updated += 1;
                } else {
                  skipped += 1;
                }
              } catch {
                skipped += 1;
              }
            }),
          );
        }

        return Response.json({ ok: true, total: rows.length, updated, skipped });
      },
    },
  },
});
