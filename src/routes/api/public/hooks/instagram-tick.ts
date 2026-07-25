import { createFileRoute } from "@tanstack/react-router";
import { publishForChannel } from "@/lib/instagram-publish.server";

/**
 * Called by pg_cron every minute. For each active schedule where the current
 * weekday/hour matches, publish the next product not yet published today.
 * Also refreshes Instagram tokens that will expire within 7 days.
 */
export const Route = createFileRoute("/api/public/hooks/instagram-tick")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date();
        const day = now.getUTCDay(); // 0..6
        const hour = now.getUTCHours(); // 0..23
        const results: any[] = [];

        // 1) Schedules
        const { data: schedules } = await supabaseAdmin
          .from("instagram_story_schedule")
          .select("id,user_id,channel_id,days,hours,active,last_run_at")
          .eq("active", true);
        for (const s of schedules ?? []) {
          if (!(s.days ?? []).includes(day)) continue;
          if (!(s.hours ?? []).includes(hour)) continue;
          if (s.last_run_at) {
            const last = new Date(s.last_run_at);
            if (last.getUTCFullYear() === now.getUTCFullYear() &&
                last.getUTCMonth() === now.getUTCMonth() &&
                last.getUTCDate() === now.getUTCDate() &&
                last.getUTCHours() === hour) continue;
          }
          const { data: alreadyToday } = await supabaseAdmin
            .from("instagram_posts").select("product_id")
            .eq("channel_id", s.channel_id).eq("kind", "story")
            .gte("published_at", new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString());
          const skipIds = (alreadyToday ?? []).map((r: any) => r.product_id).filter(Boolean);
          let q = supabaseAdmin.from("products").select("id")
            .eq("channel_id", s.channel_id).eq("availability", "active")
            .order("created_at", { ascending: false }).limit(1);
          if (skipIds.length) q = q.not("id", "in", `(${skipIds.join(",")})`);
          const { data: prod } = await q.maybeSingle();
          if (!prod) continue;
          try {
            const r = await publishForChannel({
              channelId: s.channel_id, productId: prod.id, kind: "story", userId: s.user_id,
            });
            results.push({ channel: s.channel_id, media: r.mediaId });
          } catch (e: any) {
            results.push({ channel: s.channel_id, error: String(e?.message ?? e) });
          }
          await supabaseAdmin.from("instagram_story_schedule")
            .update({ last_run_at: now.toISOString() }).eq("id", s.id);
        }

        return Response.json({ ok: true, ran: results.length, results });
      },
    },
  },
});
