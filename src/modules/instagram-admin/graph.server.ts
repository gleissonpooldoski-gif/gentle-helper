/**
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
  const res = await fetch(url.toString(), init);
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

export async function testConnection(input: {
  igId: string;
  token: string;
}): Promise<{
  username: string;
  name?: string;
  followers?: number;
  mediaCount?: number;
}> {
  return gfetch(`/${input.igId}`, {
    access_token: input.token,
    fields: "username,name,followers_count,media_count",
  }) as any;
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
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      recipient: { id: input.recipientId },
      message: { text: input.text.slice(0, 1000) },
    }),
  });
  if (!res.ok) throw new Error(`[graph messages] ${res.status} ${await res.text()}`);
}
