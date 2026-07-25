import { createFileRoute } from "@tanstack/react-router";
import {
  exchangeCodeForToken,
  extendToLongLived,
  fetchLinkedInstagramAccount,
} from "@/lib/instagram-graph.server";
import { encryptToken } from "@/lib/instagram-crypto.server";

export const Route = createFileRoute("/api/public/instagram/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const stateRaw = url.searchParams.get("state");
        const errorReason = url.searchParams.get("error_description") ?? url.searchParams.get("error");
        if (errorReason) {
          return htmlRedirect(`/?ig=error&msg=${encodeURIComponent(errorReason)}`);
        }
        if (!code || !stateRaw) return new Response("Missing code/state", { status: 400 });

        let userId: string; let channelId: string;
        try {
          const parsed = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8"));
          userId = parsed.u; channelId = parsed.c;
        } catch {
          return new Response("Invalid state", { status: 400 });
        }

        const clientId = process.env.META_APP_ID!;
        const clientSecret = process.env.META_APP_SECRET!;
        const redirectUri = `${url.protocol}//${url.host}/api/public/instagram/callback`;

        try {
          const short = await exchangeCodeForToken({ code, clientId, clientSecret, redirectUri });
          const long = await extendToLongLived({ shortToken: short.accessToken, clientId, clientSecret });
          const account = await fetchLinkedInstagramAccount(long.accessToken);
          if (!account) {
            return htmlRedirect(`/canais/${channelId}/editar?tab=instagram&ig=no_business_account`);
          }
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const expiresAt = new Date(Date.now() + long.expiresInSec * 1000).toISOString();
          await supabaseAdmin.from("instagram_connections").upsert({
            user_id: userId,
            channel_id: channelId,
            instagram_account_id: account.instagramAccountId,
            facebook_page_id: account.facebookPageId,
            username: account.username,
            name: account.name,
            profile_picture: account.profilePicture,
            followers_count: account.followers,
            follows_count: account.follows,
            media_count: account.mediaCount,
            access_token_ciphertext: encryptToken(account.pageAccessToken),
            token_expires_at: expiresAt,
            status: "connected",
            last_error: null,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id,channel_id" });

          return htmlRedirect(`/canais/${channelId}/editar?tab=instagram&ig=connected`);
        } catch (e: any) {
          return htmlRedirect(`/canais/${channelId}/editar?tab=instagram&ig=error&msg=${encodeURIComponent(String(e?.message ?? e))}`);
        }
      },
    },
  },
});

function htmlRedirect(path: string): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Redirecionando…</title><meta http-equiv="refresh" content="0;url=${path}"><a href="${path}">continuar</a>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
