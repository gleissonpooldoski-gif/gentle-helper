/**
import { fetchWithTimeout, TIMEOUTS } from "@/lib/http-timeout";
 * Meta Graph API helpers for the single-account Instagram Admin module.
 * All calls run server-side. The access token is obtained from `instagram_settings`.
 */
const GRAPH = "https://graph.facebook.com/v21.0";

async function gfetch<T>(
  path: string,
  params: Record<string, string>,
  init?: RequestInit,
): Promise<T> {
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetchWithTimeout(url.toString(), init, { timeoutMs: TIMEOUTS.api, label: `ig-admin-graph ${path}` });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok || body?.error) {
    const msg = body?.error?.message ?? `Meta ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

/**
 * Resolve the correct token for IG Graph calls.
 * If a User Access Token is provided together with a pageId, exchange it for
 * the Page Access Token (which carries pages_read_engagement automatically
 * when the user has granted it). If the exchange fails, fall back to the
 * original token so error surfaces clearly to the caller.
 */
export async function resolvePageToken(input: {
  token: string;
  pageId?: string;
}): Promise<string> {
  if (!input.pageId) return input.token;
  try {
    const res = await gfetch<{ access_token?: string }>(`/${input.pageId}`, {
      access_token: input.token,
      fields: "access_token",
    });
    return res.access_token || input.token;
  } catch {
    return input.token;
  }
}

export async function testConnection(input: {
  igId: string;
  token: string;
  pageId?: string;
}): Promise<{
  username: string;
  name?: string;
  pageName?: string;
  webhookActive: boolean;
  webhook: {
    igUserActive: boolean;
    pageActive: boolean;
    igUserError?: string;
    pageError?: string;
  };
  capabilities: { stories: boolean; comments: boolean; messages: boolean };
}> {
  const ig = await gfetch<{ id: string; username: string; name?: string }>(
    `/${input.igId}`,
    { access_token: input.token, fields: "id,username,name" },
  );

  let pageName: string | undefined;
  let pageActive = false;
  let igUserActive = false;
  let pageError: string | undefined;
  let igUserError: string | undefined;
  const pageToken = await resolvePageToken({ token: input.token, pageId: input.pageId });

  try {
    const sub = await gfetch<{ data: Array<{ subscribed_fields?: string[] }> }>(
      `/${input.igId}/subscribed_apps`,
      { access_token: pageToken },
    );
    igUserActive = (sub.data ?? []).length > 0;
  } catch (error) {
    igUserError = error instanceof Error ? error.message : String(error);
  }

  if (input.pageId) {
    try {
      const page = await gfetch<{ name?: string }>(`/${input.pageId}`, {
        access_token: input.token,
        fields: "name",
      });
      pageName = page.name;
    } catch {}
    try {
      const sub = await gfetch<{ data: Array<{ subscribed_fields?: string[] }> }>(
        `/${input.pageId}/subscribed_apps`,
        { access_token: pageToken },
      );
      pageActive = (sub.data ?? []).length > 0;
    } catch (error) {
      pageError = error instanceof Error ? error.message : String(error);
    }
  }

  const capabilities = { stories: true, comments: true, messages: true };
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (appId && appSecret) {
    try {
      const dbg = await gfetch<{ data?: { scopes?: string[] } }>(`/debug_token`, {
        input_token: input.token,
        access_token: `${appId}|${appSecret}`,
      });
      const scopes = new Set(dbg.data?.scopes ?? []);
      capabilities.stories = scopes.has("instagram_content_publish");
      capabilities.comments = scopes.has("instagram_manage_comments");
      capabilities.messages = scopes.has("instagram_manage_messages");
    } catch {}
  }

  return {
    username: ig.username,
    name: ig.name,
    pageName,
    webhookActive: igUserActive || pageActive,
    webhook: { igUserActive, pageActive, igUserError, pageError },
    capabilities,
  };
}

export async function publishStory(input: {
  igId: string;
  token: string;
  imageUrl: string;
}): Promise<string> {
  const container = await gfetch<{ id: string }>(
    `/${input.igId}/media`,
    {
      access_token: input.token,
      image_url: input.imageUrl,
      media_type: "STORIES",
    },
    { method: "POST" },
  );
  const pub = await gfetch<{ id: string }>(
    `/${input.igId}/media_publish`,
    { access_token: input.token, creation_id: container.id },
    { method: "POST" },
  );
  return pub.id;
}

export async function publishPost(input: {
  igId: string;
  token: string;
  imageUrl: string;
  caption: string;
}): Promise<string> {
  const container = await gfetch<{ id: string }>(
    `/${input.igId}/media`,
    { access_token: input.token, image_url: input.imageUrl, caption: input.caption },
    { method: "POST" },
  );
  const pub = await gfetch<{ id: string }>(
    `/${input.igId}/media_publish`,
    { access_token: input.token, creation_id: container.id },
    { method: "POST" },
  );
  return pub.id;
}

export type MediaItem = {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp: string;
  comments_count?: number;
  like_count?: number;
};

export async function listMedia(input: {
  igId: string;
  token: string;
  limit?: number;
}): Promise<MediaItem[]> {
  const res = await gfetch<{ data: MediaItem[] }>(`/${input.igId}/media`, {
    access_token: input.token,
    fields:
      "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments_count,like_count",
    limit: String(input.limit ?? 25),
  });
  return res.data ?? [];
}

export type CommentItem = {
  id: string;
  text: string;
  username?: string;
  timestamp: string;
  media?: { id: string };
};

export async function listCommentsForMedia(input: {
  mediaId: string;
  token: string;
}): Promise<CommentItem[]> {
  const res = await gfetch<{ data: CommentItem[] }>(`/${input.mediaId}/comments`, {
    access_token: input.token,
    fields: "id,text,username,timestamp",
  });
  return res.data ?? [];
}

export async function replyToComment(input: {
  commentId: string;
  token: string;
  message: string;
}): Promise<void> {
  await gfetch(
    `/${input.commentId}/replies`,
    { access_token: input.token, message: input.message },
    { method: "POST" },
  );
}

export type Conversation = {
  id: string;
  updated_time: string;
  participants?: { data: Array<{ id: string; name?: string; username?: string }> };
  messages?: { data: Array<{ id: string; message?: string; created_time: string; from?: { id: string; username?: string } }> };
};

export async function listConversations(input: {
  pageId: string;
  token: string;
}): Promise<Conversation[]> {
  const res = await gfetch<{ data: Conversation[] }>(`/${input.pageId}/conversations`, {
    access_token: input.token,
    platform: "instagram",
    fields:
      "id,updated_time,participants,messages.limit(1){id,message,created_time,from}",
  });
  return res.data ?? [];
}

export async function sendDirectMessage(input: {
  igId: string;
  token: string;
  recipientId: string;
  text: string;
}): Promise<void> {
  const url = new URL(`${GRAPH}/${input.igId}/messages`);
  url.searchParams.set("access_token", input.token);
  const res = await fetchWithTimeout(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      recipient: { id: input.recipientId },
      message: { text: input.text.slice(0, 1000) },
    }),
  });
  if (!res.ok) throw new Error(`[graph messages] ${res.status} ${await res.text()}`);
}

/**
 * Subscribes the Meta app to receive webhook events for the given IG account
 * and Facebook page. Idempotent — safe to call every publish/save.
 * Returns which endpoints subscribed successfully.
 */
export async function subscribeWebhooks(input: {
  igId: string;
  pageId: string;
  token: string;
}): Promise<{
  page: { ok: boolean; error?: string };
  igUser: { ok: boolean; error?: string };
}> {
  const pageToken = await resolvePageToken({ token: input.token, pageId: input.pageId });
  const igFields = [
    "comments",
    "messages",
    "message_reactions",
    "messaging_postbacks",
    "messaging_seen",
    "live_comments",
    "mentions",
  ].join(",");
  const pageFields = [
    "feed",
    "messages",
    "messaging_postbacks",
    "message_reactions",
    "messaging_referrals",
  ].join(",");
  const out: Awaited<ReturnType<typeof subscribeWebhooks>> = {
    page: { ok: false },
    igUser: { ok: false },
  };

  // PRIMARY: subscribe on the IG User directly. Only needs
  // instagram_manage_messages + instagram_manage_comments — you already have both.
  // Does NOT require pages_manage_metadata.
  try {
    await gfetch(
      `/${input.igId}/subscribed_apps`,
      { access_token: pageToken, subscribed_fields: igFields },
      { method: "POST" },
    );
    out.igUser.ok = true;
  } catch (e: any) {
    out.igUser.error = String(e?.message ?? e);
  }

  // BEST-EFFORT: also try Page subscription (needs pages_manage_metadata).
  // Silent fallback — IG User subscription above is enough for comments/DMs.
  try {
    await gfetch(
      `/${input.pageId}/subscribed_apps`,
      { access_token: pageToken, subscribed_fields: pageFields },
      { method: "POST" },
    );
    out.page.ok = true;
  } catch (e: any) {
    out.page.error = String(e?.message ?? e);
  }

  return out;
}

