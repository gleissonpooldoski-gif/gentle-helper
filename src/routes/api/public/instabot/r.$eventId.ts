import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/instabot/r/$eventId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const eventId = params.eventId;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: ev } = await supabaseAdmin
          .from("instabot_events")
          .select("id, automation_id, button_url")
          .eq("id", eventId)
          .maybeSingle();
        const target = ev?.button_url;
        if (ev?.automation_id) {
          await supabaseAdmin
            .from("instabot_clicks")
            .insert({ automation_id: ev.automation_id, event_id: ev.id });
        }
        if (!target) return new Response("Link indisponível", { status: 404 });
        return new Response(null, { status: 302, headers: { Location: target } });
      },
    },
  },
});
