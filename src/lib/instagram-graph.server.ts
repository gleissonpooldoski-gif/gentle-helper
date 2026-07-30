/**
import { fetchWithTimeout, TIMEOUTS } from "@/lib/http-timeout";
 * Minimal Instagram Graph API (Meta) client. All calls run server-side and
 * expect a valid Instagram Business/Creator page access token.
 */
const GRAPH = "https://graph.facebook.com/v21.0";

async function gfetch<T>(path: string, params: Record<string, string>, init?: RequestInit): Promise<T> {
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetchWithTimeout(url.toString(), init, { timeoutMs: TIMEOUTS.api, label: `ig-graph ${path}` });
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok || body?.error) {
    const msg = body?.error?.message ?? `Meta ${res.status}`;
    throw new Error(`[graph ${path}] ${msg}`);
  }
  return body as T;
}

export async function exchangeCodeForToken(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<{ accessToken: string }> {
  const data = await gfetch<{ access_token: string }>("/oauth/access_token", {
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
  });
  return { accessToken: data.access_token };
}

export async function extendToLongLived(input: {
  shortToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ accessToken: string; expiresInSec: number }> {
  const data = await gfetch<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    fb_exchange_token: input.shortToken,
  });
  return { accessToken: data.access_token, expiresInSec: data.expires_in ?? 60 * 24 * 3600 };
}

export type IgAccountInfo = {
  facebookPageId: string;
  pageAccessToken: string;
  instagramAccountId: string;
  username: string;
  name: string;
  profilePicture: string;
  followers: number;
  follows: number;
  mediaCount: number;
};

export async function fetchLinkedInstagramAccount(userAccessToken: string): Promise<IgAccountInfo | null> {
  const pages = await gfetch<{ data: Array<{ id: string; access_token: string; name: string }> }>(
    "/me/accounts",
    { access_token: userAccessToken, fields: "id,access_token,name" },
  );
  for (const page of pages.data) {
    const pageDetail = await gfetch<{ instagram_business_account?: { id: string } }>(
      `/${page.id}`,
      { access_token: page.access_token, fields: "instagram_business_account" },
    );
    const igId = pageDetail.instagram_business_account?.id;
    if (!igId) continue;
    const ig = await gfetch<{
      username: string; name?: string; profile_picture_url?: string;
      followers_count?: number; follows_count?: number; media_count?: number;
    }>(`/${igId}`, {
      access_token: page.access_token,
      fields: "username,name,profile_picture_url,followers_count,follows_count,media_count",
    });
    return {
      facebookPageId: page.id,
      pageAccessToken: page.access_token,
      instagramAccountId: igId,
      username: ig.username,
      name: ig.name ?? page.name,
      profilePicture: ig.profile_picture_url ?? "",
      followers: ig.followers_count ?? 0,
      follows: ig.follows_count ?? 0,
      mediaCount: ig.media_count ?? 0,
    };
  }
  return null;
}

export async function refreshAccountMetrics(igId: string, token: string) {
  return gfetch<{ followers_count?: number; follows_count?: number; media_count?: number }>(
    `/${igId}`,
    { access_token: token, fields: "followers_count,follows_count,media_count" },
  );
}

/** Publishes a single image post to Instagram feed. Returns the media id. */
export async function publishImagePost(input: {
  igId: string;
  token: string;
  imageUrl: string;
  caption: string;
}): Promise<string> {
  const container = await gfetch<{ id: string }>(`/${input.igId}/media`, {
    access_token: input.token,
    image_url: input.imageUrl,
    caption: input.caption,
  }, { method: "POST" });
  const pub = await gfetch<{ id: string }>(`/${input.igId}/media_publish`, {
    access_token: input.token,
    creation_id: container.id,
  }, { method: "POST" });
  return pub.id;
}

/** Publishes an image story. */
export async function publishImageStory(input: {
  igId: string;
  token: string;
  imageUrl: string;
}): Promise<string> {
  const container = await gfetch<{ id: string }>(`/${input.igId}/media`, {
    access_token: input.token,
    image_url: input.imageUrl,
    media_type: "STORIES",
  }, { method: "POST" });
  const pub = await gfetch<{ id: string }>(`/${input.igId}/media_publish`, {
    access_token: input.token,
    creation_id: container.id,
  }, { method: "POST" });
  return pub.id;
}

/** Replies to a comment (public reply). */
export async function replyToComment(input: {
  commentId: string; token: string; message: string;
}): Promise<void> {
  await gfetch(`/${input.commentId}/replies`, {
    access_token: input.token,
    message: input.message,
  }, { method: "POST" });
}

/** Sends a DM to a user via the Messenger Send API (Instagram platform). */
export async function sendDirectMessage(input: {
  igId: string; token: string; recipientId: string; text: string; buttonUrl?: string; buttonTitle?: string;
}): Promise<void> {
  const payload: any = { recipient: { id: input.recipientId } };
  if (input.buttonUrl) {
    payload.message = {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: input.text.slice(0, 640),
          buttons: [{ type: "web_url", url: input.buttonUrl, title: (input.buttonTitle ?? "VER PARA COMPRAR").slice(0, 20) }],
        },
      },
    };
  } else {
    payload.message = { text: input.text.slice(0, 1000) };
  }
  const url = new URL(`${GRAPH}/${input.igId}/messages`);
  url.searchParams.set("access_token", input.token);
  const res = await fetchWithTimeout(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }, { timeoutMs: TIMEOUTS.api, label: "ig-graph messages" });
  if (!res.ok) throw new Error(`[graph messages] ${res.status} ${await res.text()}`);
}

export function buildOAuthAuthorizeUrl(input: {
  clientId: string; redirectUri: string; state: string;
}): string {
  const scopes = [
    "instagram_basic",
    "instagram_manage_comments",
    "instagram_manage_messages",
    "instagram_content_publish",
    "pages_manage_metadata",
    "pages_read_engagement",
    "pages_messaging",
    "pages_show_list",
    "business_management",
  ].join(",");
  const u = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  u.searchParams.set("client_id", input.clientId);
  u.searchParams.set("redirect_uri", input.redirectUri);
  u.searchParams.set("state", input.state);
  u.searchParams.set("scope", scopes);
  u.searchParams.set("response_type", "code");
  return u.toString();
}
