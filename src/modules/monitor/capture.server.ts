/**
 * Captura de produtos a partir de mensagens de grupos monitorados (Evolution API).
 *
 * Fluxo:
 *   1. Recebe um payload MESSAGES_UPSERT.
 *   2. Ignora mensagens que não sejam de grupos monitorados.
 *   3. Extrai URLs suportadas (Shopee, Mercado Livre, Amazon, AliExpress, Magalu).
 *   4. Deriva o `channel_id` a partir do grupo monitorado ou da instância WA.
 *   5. Enriquecimento mínimo (título/imagem/preço via OpenGraph).
 *   6. Gera link de afiliado por plataforma.
 *   7. Faz upsert em `public.products` com deduplicação por link.
 *
 * Nunca lança — falhas são apenas logadas.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { scrapeShopeeImage } from "@/modules/products/shopee-import/image-resolver";
import { generateAffiliateUrl as generateMLAffiliate } from "@/modules/affiliate/mercado-livre/service";
import { generateAffiliateUrl as generateMagaluAffiliate } from "@/modules/affiliate/magalu/service";

const SHOPEE_FALLBACK_AFFILIATE_ID = "18355410386";

type Platform = "shopee" | "mercadolivre" | "amazon" | "aliexpress" | "magalu";

const HOST_TO_PLATFORM: Array<{ match: RegExp; platform: Platform }> = [
  { match: /(^|\.)shopee\.com\.br$|(^|\.)shopee\./i, platform: "shopee" },
  { match: /shope\.ee/i, platform: "shopee" },
  { match: /mercadoli(vre|bre)|mlb\.|\/MLB-/i, platform: "mercadolivre" },
  { match: /amazon\.|amzn\.to/i, platform: "amazon" },
  { match: /aliexpress\.|s\.click\.aliexpress/i, platform: "aliexpress" },
  { match: /magazineluiza|magazinevoce|magalu/i, platform: "magalu" },
];

const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;

export function extractUrls(text: string): string[] {
  if (!text) return [];
  const matches = text.match(URL_REGEX) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of matches) {
    const cleaned = raw.replace(/[),.;!?]+$/g, "");
    if (!seen.has(cleaned)) {
      seen.add(cleaned);
      out.push(cleaned);
    }
  }
  return out;
}

export function detectPlatform(url: string): Platform | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const full = `${host}${u.pathname}`;
    for (const entry of HOST_TO_PLATFORM) {
      if (entry.match.test(full) || entry.match.test(host)) return entry.platform;
    }
    return null;
  } catch {
    return null;
  }
}

/** Resolve encurtadores conhecidos seguindo redirects (best effort). */
async function resolveShortLink(url: string): Promise<string> {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const isShort =
      host.includes("shope.ee") ||
      host === "amzn.to" ||
      host.includes("s.click.aliexpress") ||
      host.includes("mercadolivre.com/sec/") ||
      host.endsWith("/sec");
    if (!isShort) return url;
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; DivulgaLinksBot/1.0)" },
    });
    return res.url || url;
  } catch {
    return url;
  }
}

function extractItemId(url: string, platform: Platform): string {
  try {
    const u = new URL(url);
    const path = u.pathname;
    if (platform === "shopee") {
      // .../produto-i.<shopId>.<itemId>
      const m = path.match(/\.(\d+)\.(\d+)(?:\?|$|\/)/);
      if (m) return `${m[1]}.${m[2]}`;
    }
    if (platform === "mercadolivre") {
      const m = path.match(/MLB-?(\d+)/i);
      if (m) return `MLB${m[1]}`;
    }
    if (platform === "amazon") {
      const m = path.match(/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})/i);
      if (m) return m[1].toUpperCase();
    }
    if (platform === "aliexpress") {
      const m = path.match(/\/item\/(\d+)/);
      if (m) return m[1];
    }
  } catch {
    // fallthrough
  }
  // fallback determinístico: hash simples do URL bruto
  let hash = 0;
  for (let i = 0; i < url.length; i++) hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
  return `raw_${Math.abs(hash)}`;
}

type OgMeta = { title: string | null; image: string | null; price: number | null };

async function fetchOgMeta(url: string): Promise<OgMeta> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Linux; U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36 (compatible; WhatsApp/2.24)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return { title: null, image: null, price: null };
    const html = (await res.text()).slice(0, 200_000);
    const pick = (re: RegExp) => {
      const m = html.match(re);
      return m ? m[1].trim() : null;
    };
    const title =
      pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ??
      pick(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i) ??
      pick(/<title>([^<]+)<\/title>/i);
    const image =
      pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      pick(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    const priceRaw =
      pick(/<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i) ??
      pick(/<meta[^>]+property=["']og:price:amount["'][^>]+content=["']([^"']+)["']/i);
    let price: number | null = null;
    if (priceRaw) {
      const n = Number(priceRaw.replace(/\./g, "").replace(",", "."));
      if (Number.isFinite(n) && n > 0) price = n;
    }
    return { title, image, price };
  } catch {
    return { title: null, image: null, price: null };
  }
}

function tagShopee(url: string, affiliateId: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("af_id", affiliateId);
    return u.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}af_id=${encodeURIComponent(affiliateId)}`;
  }
}

async function getShopeeAffiliateId(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("shopee_affiliate_configs")
    .select("affiliate_id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.affiliate_id?.trim() || SHOPEE_FALLBACK_AFFILIATE_ID) as string;
}

async function buildAffiliateLink(
  supabase: SupabaseClient<Database>,
  userId: string,
  platform: Platform,
  productUrl: string,
): Promise<string> {
  try {
    if (platform === "shopee") {
      const id = await getShopeeAffiliateId(supabase, userId);
      return tagShopee(productUrl, id);
    }
    if (platform === "mercadolivre") {
      try {
        const { affiliateUrl } = await generateMLAffiliate(supabase, userId, productUrl);
        return affiliateUrl || productUrl;
      } catch {
        return productUrl;
      }
    }
    if (platform === "magalu") {
      const { affiliateUrl } = await generateMagaluAffiliate(supabase, userId, productUrl);
      return affiliateUrl || productUrl;
    }
    // Amazon / AliExpress: sem geração automática configurada → salva original.
    return productUrl;
  } catch {
    return productUrl;
  }
}

export type CaptureContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
  channelId: string;
  groupJid: string;
  groupName: string | null;
};

async function captureOne(ctx: CaptureContext, rawUrl: string): Promise<"inserted" | "updated" | "skipped"> {
  const platform = detectPlatform(rawUrl);
  if (!platform) return "skipped";

  const resolved = await resolveShortLink(rawUrl);
  const finalPlatform = detectPlatform(resolved) ?? platform;
  const itemId = extractItemId(resolved, finalPlatform);

  // Dedup rápido por link bruto ou item_id neste canal.
  const { data: existing } = await ctx.supabase
    .from("products")
    .select("id, image_url, title")
    .eq("user_id", ctx.userId)
    .eq("channel_id", ctx.channelId)
    .eq("platform", finalPlatform)
    .or(`item_id.eq.${itemId},raw_link.eq.${resolved}`)
    .limit(1)
    .maybeSingle();

  // Enriquecimento (título/imagem/preço).
  const meta = await fetchOgMeta(resolved);
  let image = meta.image;
  if (!image && finalPlatform === "shopee") {
    image = await scrapeShopeeImage(resolved).catch(() => null);
  }

  const affiliate = await buildAffiliateLink(ctx.supabase, ctx.userId, finalPlatform, resolved);
  const title = (meta.title ?? existing?.title ?? "Produto capturado").slice(0, 300);

  const payload = {
    user_id: ctx.userId,
    channel_id: ctx.channelId,
    platform: finalPlatform,
    item_id: itemId,
    title,
    image_url: image ?? existing?.image_url ?? null,
    raw_link: resolved,
    affiliate_link: affiliate,
    original_price: meta.price,
    promo_price: meta.price,
    availability: "ACTIVE" as const,
    source: "monitor",
    source_group_jid: ctx.groupJid,
    source_group_name: ctx.groupName,
  };

  const { error } = await ctx.supabase
    .from("products")
    .upsert(payload as never, { onConflict: "user_id,channel_id,platform,item_id" });

  if (error) {
    console.error("[MONITOR] upsert error", error.message);
    return "skipped";
  }
  return existing ? "updated" : "inserted";
}

type EvolutionMessage = {
  key?: { remoteJid?: string; fromMe?: boolean };
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string };
    videoMessage?: { caption?: string };
  };
  pushName?: string;
};

function extractText(msg: EvolutionMessage): string {
  return (
    msg?.message?.conversation ??
    msg?.message?.extendedTextMessage?.text ??
    msg?.message?.imageMessage?.caption ??
    msg?.message?.videoMessage?.caption ??
    ""
  );
}

/**
 * Processa um evento MESSAGES_UPSERT da Evolution API.
 * Recebe o payload bruto e a instância que originou o webhook.
 */
export async function handleEvolutionMessage(
  supabase: SupabaseClient<Database>,
  instanceName: string,
  payload: unknown,
): Promise<{ processed: number; inserted: number; updated: number; skipped: number }> {
  const stats = { processed: 0, inserted: 0, updated: 0, skipped: 0 };

  const raw = payload as { data?: EvolutionMessage | EvolutionMessage[]; messages?: EvolutionMessage[] };
  const messages: EvolutionMessage[] = Array.isArray(raw?.data)
    ? raw.data
    : Array.isArray(raw?.messages)
      ? raw.messages
      : raw?.data
        ? [raw.data as EvolutionMessage]
        : [];

  if (messages.length === 0) return stats;

  // Instância → user_id (dono).
  const { data: instance } = await supabase
    .from("whatsapp_instances")
    .select("user_id")
    .eq("instance_name", instanceName)
    .maybeSingle();
  if (!instance?.user_id) return stats;
  const userId = instance.user_id as string;

  // Grupos monitorados deste usuário.
  const { data: monitored } = await supabase
    .from("monitored_groups")
    .select("group_jid, group_name, channel_id")
    .eq("user_id", userId)
    .eq("is_active", true);
  const monitorMap = new Map<string, { name: string | null; channelId: string | null }>();
  for (const row of monitored ?? []) {
    monitorMap.set(row.group_jid, { name: row.group_name, channelId: (row as { channel_id: string | null }).channel_id ?? null });
  }
  if (monitorMap.size === 0) return stats;

  // Fallback de channel_id: primeiro canal do usuário.
  let fallbackChannelId: string | null = null;
  const { data: firstChannel } = await supabase
    .from("channels")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  fallbackChannelId = firstChannel?.id ?? null;

  for (const msg of messages) {
    const jid = msg?.key?.remoteJid ?? "";
    if (!jid.endsWith("@g.us")) continue;
    const group = monitorMap.get(jid);
    if (!group) continue;

    const channelId = group.channelId ?? fallbackChannelId;
    if (!channelId) continue;

    const text = extractText(msg);
    const urls = extractUrls(text);
    if (urls.length === 0) continue;

    for (const url of urls) {
      stats.processed++;
      const result = await captureOne(
        { supabase, userId, channelId, groupJid: jid, groupName: group.name },
        url,
      );
      stats[result]++;
    }
  }

  return stats;
}
