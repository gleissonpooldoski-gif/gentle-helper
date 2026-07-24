import { createFileRoute } from "@tanstack/react-router";

/**
 * Rotina de sincronização periódica dos produtos importados.
 * Revalida em lote os mais antigos (ou nunca validados) e atualiza o
 * status em `products.availability`. Executa via pg_cron.
 */
export const Route = createFileRoute("/api/public/hooks/products-validate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
        const staleHours = Math.max(1, Number(url.searchParams.get("staleHours") ?? 24));

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { validateProduct, persistValidation } = await import(
          "@/modules/products/validation/validate.server"
        );

        const staleBefore = new Date(Date.now() - staleHours * 3600_000).toISOString();

        // Prioriza os que nunca foram validados; depois os mais antigos.
        const { data: rows, error } = await supabaseAdmin
          .from("products")
          .select("id, platform, affiliate_link, raw_link, image_url, availability, last_validated_at")
          .or(`last_validated_at.is.null,last_validated_at.lt.${staleBefore}`)
          .order("last_validated_at", { ascending: true, nullsFirst: true })
          .limit(limit);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        const results = { active: 0, inactive: 0, out_of_stock: 0, error: 0 };
        for (const p of rows ?? []) {
          const r = await validateProduct(p);
          await persistValidation(supabaseAdmin, p.id, r);
          results[r.availability] += 1;
        }
        return Response.json({ ok: true, processed: rows?.length ?? 0, results });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to trigger" }),
    },
  },
});
