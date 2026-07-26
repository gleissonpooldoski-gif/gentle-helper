import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/public-auth.server";

export const Route = createFileRoute("/api/public/hooks/shopee-reports-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFail = requireCronSecret(request);
        if (authFail) return authFail;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { syncShopeeConversions } = await import("@/modules/reports/shopee-reports.server");

        const { data: users, error } = await supabaseAdmin
          .from("affiliate_connections")
          .select("user_id")
          .eq("platform", "shopee")
          .eq("status", "connected")
          .not("api_key_encrypted", "is", null);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        const results: Array<{ userId: string; ok: boolean; inserted?: number; error?: string }> = [];
        for (const u of users ?? []) {
          try {
            const r = await syncShopeeConversions(supabaseAdmin, u.user_id);
            results.push({ userId: u.user_id, ok: true, inserted: r.inserted });
          } catch (err: any) {
            const msg = err instanceof Error
              ? err.message
              : (err?.message || err?.details || err?.hint || JSON.stringify(err));
            results.push({ userId: u.user_id, ok: false, error: msg });
          }

        }
        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
