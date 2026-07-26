import { createFileRoute } from "@tanstack/react-router";
import { publishForChannel } from "@/lib/instagram-publish.server";
import { requireCronSecret } from "@/lib/public-auth.server";

/**
 * Called by pg_cron every minute. For each active schedule where the current
 * weekday/hour matches, publish the next product not yet published today.
 * Also refreshes Instagram tokens that will expire within 7 days.
 */
export const Route = createFileRoute("/api/public/hooks/instagram-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFail = requireCronSecret(request);
        if (authFail) return authFail;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date();
        // Compare schedules in America/Sao_Paulo (Brasília, UTC-3, no DST).
        const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
        const day = brt.getUTCDay(); // 0..6 in Brasília
        const hour = brt.getUTCHours(); // 0..23 in Brasília
        const results: any[] = [];

        // 1) Schedules (per-channel)
        const { data: schedules } = await supabaseAdmin
          .from("instagram_story_schedule")
          .select("id,user_id,channel_id,days,hours,active,last_run_at,template_id")
          .eq("active", true);
        for (const s of schedules ?? []) {
          const dayOk = (s.days ?? []).includes(day);
          const hourOk = (s.hours ?? []).includes(hour);
          let shouldPublish = s.active && dayOk && hourOk;
          if (shouldPublish && s.last_run_at) {
            const last = new Date(s.last_run_at);
            if (last.getUTCFullYear() === now.getUTCFullYear() &&
                last.getUTCMonth() === now.getUTCMonth() &&
                last.getUTCDate() === now.getUTCDate() &&
                last.getUTCHours() === hour) shouldPublish = false;
          }
          console.log("[STORY_SCHEDULE_CHECK]", {
            schedule_id: s.id, day, hour, active: s.active, should_publish: shouldPublish,
          });
          if (!shouldPublish) continue;

          const { data: alreadyToday } = await supabaseAdmin
            .from("instagram_posts").select("product_id")
            .eq("channel_id", s.channel_id).eq("kind", "story")
            .gte("published_at", new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString());
          const skipIds = (alreadyToday ?? []).map((r: any) => r.product_id).filter(Boolean);

          // Priority: real-discount products first (is_discount=true), then any active
          let discountQ = supabaseAdmin.from("products").select("id")
            .eq("channel_id", s.channel_id).eq("availability", "active")
            .eq("is_discount", true)
            .not("original_price", "is", null).not("promo_price", "is", null)
            .order("created_at", { ascending: false }).limit(1);
          if (skipIds.length) discountQ = discountQ.not("id", "in", `(${skipIds.join(",")})`);
          let prod: { id: string } | null = (await discountQ.maybeSingle()).data;
          if (!prod) {
            let q = supabaseAdmin.from("products").select("id")
              .eq("channel_id", s.channel_id).eq("availability", "active")
              .order("created_at", { ascending: false }).limit(1);
            if (skipIds.length) q = q.not("id", "in", `(${skipIds.join(",")})`);
            prod = (await q.maybeSingle()).data;
          }
          if (!prod) continue;

          const { data: conn } = await supabaseAdmin
            .from("instagram_connections").select("instagram_account_id,username")
            .eq("channel_id", s.channel_id).maybeSingle();
          console.log("[STORY_PUBLISH]", {
            product_id: prod.id,
            template_id: s.template_id ?? null,
            instagram_account: conn?.username ?? conn?.instagram_account_id ?? null,
            caption: null,
          });

          try {
            const r = await publishForChannel({
              channelId: s.channel_id, productId: prod.id, kind: "story",
              userId: s.user_id, templateId: s.template_id ?? undefined,
            });
            results.push({ channel: s.channel_id, media: r.mediaId });
          } catch (e: any) {
            results.push({ channel: s.channel_id, error: String(e?.message ?? e) });
          }
          await supabaseAdmin.from("instagram_story_schedule")
            .update({ last_run_at: now.toISOString() }).eq("id", s.id);
        }


        // 2) Admin (single-account) schedule → publishes latest active product as a Story
        //    using the selected template image_url (fallback to product image).
        try {
          const { data: adminSchedules } = await supabaseAdmin
            .from("instagram_admin_schedule" as any)
            .select("id,user_id,days,hours,active,last_run_at,template_id")
            .eq("active", true);
          for (const s of (adminSchedules as any[]) ?? []) {
            if (!(s.days ?? []).includes(day)) continue;
            if (!(s.hours ?? []).includes(hour)) continue;
            if (s.last_run_at) {
              const last = new Date(s.last_run_at);
              if (
                last.getUTCFullYear() === now.getUTCFullYear() &&
                last.getUTCMonth() === now.getUTCMonth() &&
                last.getUTCDate() === now.getUTCDate() &&
                last.getUTCHours() === hour
              )
                continue;
            }
            const { loadSettings } = await import("@/modules/instagram-admin/settings.server");
            const { composeStoryPng, uploadAndPublishStory } = await import(
              "@/modules/instagram-admin/compose.server"
            );
            const settings = await loadSettings();
            if (!settings) continue;

            let templateUrl: string | null = null;
            let titleColor: string | undefined;
            if (s.template_id) {
              const { data: tpl } = await supabaseAdmin
                .from("instagram_story_templates")
                .select("image_url,title_color")
                .eq("id", s.template_id)
                .maybeSingle();
              if (tpl?.image_url) templateUrl = tpl.image_url;
              titleColor = (tpl as any)?.title_color ?? undefined;
            }
            // Rotate across ALL groups/channels (not just the newest one).
            const { pickStoryProduct } = await import(
              "@/modules/instagram-admin/pick-product.server"
            );
            const prod = await pickStoryProduct();
            if (!prod) {
              results.push({ admin: s.user_id, skipped: "no-product" });
              continue;
            }

            try {
              const pngBytes = await composeStoryPng({
                templateUrl,
                titleColor,
                product: {
                  title: (prod as any).title,
                  image_url: (prod as any).image_url,
                  promo_price: (prod as any).promo_price,
                  original_price: (prod as any).original_price,
                },
              });
              const storyId = await uploadAndPublishStory({
                pngBytes,
                igId: settings.instagramBusinessId,
                token: settings.accessToken,
              });
              const affiliateLink =
                (prod as any)?.affiliate_link ?? (prod as any)?.raw_link ?? "";
              await supabaseAdmin.from("instagram_campaigns").insert({
                story_id: storyId,
                product_id: (prod as any)?.id ?? null,
                template_id: s.template_id ?? null,
                keyword: "eu quero",
                message:
                  "Olá 👋 Aqui está o link da promoção que você pediu:\n\n{{title}}\n👉 {{affiliate_link}}",
                affiliate_link: affiliateLink,
                status: "published",
                published_at: new Date().toISOString(),
              });
              results.push({ admin: s.user_id, media: storyId });
            } catch (e: any) {
              results.push({ admin: s.user_id, error: String(e?.message ?? e) });
            }

            await supabaseAdmin
              .from("instagram_admin_schedule" as any)
              .update({ last_run_at: now.toISOString() })
              .eq("id", s.id);

          }
        } catch (e: any) {
          results.push({ adminScheduleError: String(e?.message ?? e) });
        }

        return Response.json({ ok: true, ran: results.length, results });
      },
    },
  },
});
