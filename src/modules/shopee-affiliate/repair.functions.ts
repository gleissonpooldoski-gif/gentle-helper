/**
 * Lote 15E — Server function para disparar o reparo Shopee.
 *
 * Escopo:
 *  - Autenticado (RLS aplica); opera apenas sobre produtos do próprio
 *    `context.userId` via `repairShopeeProducts` isolado por credencial.
 *  - `mode="pilot"` → 100 produtos (50 aleatórios + 50 de risco).
 *  - `mode="full"` → todos os Shopee do usuário (usar somente após piloto
 *    aprovado — Lote 15E FASE 6).
 *
 * Nunca altera layout, templates, WhatsApp, Instagram ou pipeline de
 * publicação. Só grava em `products` (promo_price, original_price,
 * discount_percentage, is_discount, sales, sales_label, updated_at).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  mode: z.enum(["pilot", "full"]).default("pilot"),
  concurrency: z.number().int().min(1).max(5).optional(),
});

export const runShopeeRepair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { repairShopeeProducts } = await import(
      "@/modules/shopee-affiliate/repair.server"
    );
    const summary = await repairShopeeProducts(
      context.supabase,
      context.userId,
      { mode: data.mode, concurrency: data.concurrency },
    );
    // Devolve DTO plano; omite `records` grandes do retorno RPC
    // (permanecem em log estruturado para auditoria).
    return {
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
    };
  });
