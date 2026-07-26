/**
 * Server function wrapper para a auto-sincronização Shopee (Lote 12G).
 *
 * Chamada fire-and-forget pelo cliente após cada chunk de importação CSV.
 * Concorrência máxima de 3 por chamada. Nunca bloqueia a UI: o cliente
 * dispara sem aguardar. Erros permanentes (401/404) não retentam;
 * transientes (5xx/timeout) usam backoff 1s → 3s → 8s (ver auto-sync.server).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1).max(200),
});

export const syncShopeePricesForProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { syncShopeePricesBatch } = await import(
      "@/modules/shopee-affiliate/auto-sync.server"
    );
    const results = await syncShopeePricesBatch(
      context.supabase,
      context.userId,
      data.productIds,
      3,
    );
    const summary = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});
    console.log(
      "[SHOPEE_PRICE_AUTO_SYNC:summary]",
      JSON.stringify({
        userId: context.userId,
        total: results.length,
        summary,
      }),
    );
    return { total: results.length, summary };
  });
