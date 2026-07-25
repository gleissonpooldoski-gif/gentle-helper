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

/** Parâmetros de rastreamento/afiliado de terceiros que precisam ser removidos. */
const TRACKING_PARAM_PATTERNS: RegExp[] = [
  /^af_id$/i, /^smtt$/i, /^af_.*/i, /^utm_.*/i, /^ref$/i, /^referrer$/i,
  /^tag$/i, /^ascsubtag$/i, /^linkCode$/i, /^linkId$/i, // amazon
  /^matt_.*/i, /^tracking_id$/i, /^pdp_.*/i, // mercadolivre/aliexpress
  /^aff_.*/i, /^sk$/i, /^src$/i, /^dp_.*/i,
  /^partner_id$/i, // magalu
  /^gclid$/i, /^fbclid$/i,
];

function stripThirdPartyTracking(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const keys = Array.from(u.searchParams.keys());
    for (const k of keys) {
      if (TRACKING_PARAM_PATTERNS.some((re) => re.test(k))) {
        u.searchParams.delete(k);
      }
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
}

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
      host === "s.shopee.com.br" ||
      host === "c.shopee.com.br" ||
      host === "m.shopee.com.br" ||
      new URL(url).pathname.startsWith("/universal-link/") ||
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
      // Formato atual dos redirects curtos: /nome-da-loja/<shopId>/<itemId>
      const current = path.match(/\/(\d+)\/(\d+)\/?$/);
      if (current) return `${current[1]}.${current[2]}`;
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

type MessageMeta = {
  title: string | null;
  price: number | null;
  priceBefore: number | null;
  sold: number | null;
  soldLabel: string | null;
};

/**
 * Parseia texto de vendas no padrão Shopee: "5 mil vendidos", "1,5 mil+",
 * "10 mil vendidos", "300+ vendidos". Retorna número absoluto e label limpa.
 */
function parseSalesText(text: string): { sold: number; label: string } | null {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(mil|k)?\s*\+?\s*vendid/i);
  if (!m) return null;
  const raw = Number((m[1] ?? "").replace(",", "."));
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const multiplier = m[2] ? 1000 : 1;
  const sold = Math.round(raw * multiplier);
  const label = multiplier === 1000
    ? `${Number.isInteger(raw) ? raw : String(raw).replace(".", ",")} mil`
    : `${sold}`;
  return { sold, label };
}

function parseBrazilianMoney(value: string): number | null {
  const normalized = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Usa o texto original da oferta quando a Shopee bloqueia preço/título no servidor. */
function parseMessageMeta(text: string): MessageMeta {
  const prices = Array.from(text.matchAll(/R\$\s*([\d.]+(?:,\d{1,2})?)/gi))
    .map((match) => parseBrazilianMoney(match[1] ?? ""))
    .filter((value): value is number => value !== null);
  const uniquePrices = Array.from(new Set(prices));
  const price = uniquePrices.length > 0 ? Math.min(...uniquePrices) : null;
  const priceBefore = uniquePrices.length > 1 ? Math.max(...uniquePrices) : price;

  const title = text
    .split(/\r?\n/)
    .map((line) => line.replace(URL_REGEX, "").replace(/^[\s🔥🚨⚡💥✅🛒📦🎁⭐*-]+/u, "").trim())
    .find((line) =>
      line.length >= 8 &&
      !/^R\$/i.test(line) &&
      !/^(de|por|cupom|compre|oferta|promoção|link|frete)\b/i.test(line),
    ) ?? null;

  const salesParsed = parseSalesText(text);
  return {
    title,
    price,
    priceBefore,
    sold: salesParsed?.sold ?? null,
    soldLabel: salesParsed?.label ?? null,
  };
}

const OG_USER_AGENTS: Array<{ ua: string; tag: string }> = [
  { ua: "WhatsApp/2.24.0.85 A", tag: "wa" },
  { ua: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", tag: "fb" },
  { ua: "TelegramBot (like TwitterBot)", tag: "tg" },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.127 Safari/537.36",
    tag: "desktop",
  },
];

async function fetchHtml(url: string, ua: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": ua,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.7",
      },
    });
    if (!res.ok) return null;
    return (await res.text()).slice(0, 300_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseOg(html: string): OgMeta {
  const pick = (re: RegExp) => {
    const m = html.match(re);
    return m ? m[1].trim() : null;
  };
  const decode = (s: string | null) =>
    s
      ? s
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/\s+/g, " ")
          .trim()
      : null;
  const title =
    decode(pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)) ??
    decode(pick(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i)) ??
    decode(pick(/<title>([^<]+)<\/title>/i));
  const image =
    pick(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) ??
    pick(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i);
  const priceRaw =
    pick(/<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i) ??
    pick(/<meta[^>]+property=["']og:price:amount["'][^>]+content=["']([^"']+)["']/i);
  let price: number | null = null;
  if (priceRaw) {
    const n = Number(priceRaw.replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n) && n > 0) price = n;
  }
  return { title, image, price };
}

function isGenericTitle(t: string | null): boolean {
  if (!t) return true;
  const low = t.toLowerCase().trim();
  if (low.length < 5) return true;
  return (
    low === "shopee" ||
    low.startsWith("shopee brasil") ||
    low.startsWith("shopee | ") ||
    low.startsWith("shopee - ") ||
    low.endsWith("| shopee brasil") ||
    low.includes("compre produtos com o menor preço") ||
    low === "mercado livre" ||
    low === "magazine luiza" ||
    low === "amazon.com.br"
  );
}

async function fetchOgMeta(url: string): Promise<OgMeta> {
  let best: OgMeta = { title: null, image: null, price: null };
  for (const { ua } of OG_USER_AGENTS) {
    const html = await fetchHtml(url, ua);
    if (!html) continue;
    const meta = parseOg(html);
    if (!best.title && meta.title) best.title = meta.title;
    if (!best.image && meta.image) best.image = meta.image;
    if (!best.price && meta.price) best.price = meta.price;
    if (best.title && !isGenericTitle(best.title) && best.image && best.price) break;
  }
  if (isGenericTitle(best.title)) best.title = null;
  return best;
}

/**
 * Enriquecimento específico Shopee via API interna /api/v4/pdp/get_pc.
 * Retorna título/imagem/preço/preço original de forma confiável.
 */
async function fetchShopeePdp(
  url: string,
): Promise<{ title: string | null; image: string | null; price: number | null; priceBefore: number | null; sold: number | null; soldLabel: string | null }> {
  const empty = { title: null, image: null, price: null, priceBefore: null, sold: null, soldLabel: null };
  try {
    const u = new URL(url);
    const path = u.pathname;
    let shopId: string | null = null;
    let itemId: string | null = null;
    const m1 = path.match(/\.(\d+)\.(\d+)(?:\?|$|\/)/);
    if (m1) {
      shopId = m1[1];
      itemId = m1[2];
    } else {
      const m2 = path.match(/product\/(\d+)\/(\d+)/);
      if (m2) {
        shopId = m2[1];
        itemId = m2[2];
      } else {
        // Redirect atual de s.shopee.com.br: /nome-da-loja/<shopId>/<itemId>
        const m3 = path.match(/\/(\d+)\/(\d+)\/?$/);
        if (m3) {
          shopId = m3[1];
          itemId = m3[2];
        }
      }
    }
    if (!shopId || !itemId) return empty;

    const api = `https://shopee.com.br/api/v4/pdp/get_pc?item_id=${itemId}&shop_id=${shopId}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(api, {
      signal: controller.signal,
      headers: {
        "x-api-source": "pc",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        accept: "application/json",
        referer: url,
        "accept-language": "pt-BR,pt;q=0.9",
      },
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return empty;
    const json = (await res.json()) as {
      data?: {
        item?: {
          title?: string;
          price?: number;
          price_min?: number;
          price_max?: number;
          price_before_discount?: number;
          price_min_before_discount?: number;
          price_max_before_discount?: number;
          images?: string[];
          historical_sold?: number;
          historical_sold_count?: number;
          global_sold_count?: number;
          sold?: number;
          sold_count?: number;
          item_card_display_sold_count?: {
            placement_sold_count?: number | string;
            historical_sold_count?: number;
            monthly_sold_count?: number;
          };
        };
      };
    };
    const item = json?.data?.item;
    if (!item) return empty;
    const rawPrice = item.price ?? item.price_min ?? item.price_max ?? null;
    const rawBefore =
      item.price_before_discount ??
      item.price_min_before_discount ??
      item.price_max_before_discount ??
      null;
    const price = rawPrice ? rawPrice / 100000 : null;
    let priceBefore = rawBefore && rawBefore > 0 ? rawBefore / 100000 : null;
    // Se o "de" for igual (ou menor) ao "por", não é desconto real — descarta.
    if (priceBefore != null && price != null && priceBefore <= price) priceBefore = null;
    const image = item.images?.[0] ? `https://down-br.img.susercontent.com/file/${item.images[0]}` : null;

    // Shopee expõe a contagem de vendas em múltiplos campos, com granularidades
    // diferentes: `sold` = últimos ~30 dias (baixo), `historical_sold` /
    // `global_sold_count` / `item_card_display_sold_count.*` = acumulado real
    // (o que a UI mostra como "6 mil vendidos"). Se pegarmos o primeiro que
    // aparece, corremos o risco de salvar 6 quando o real é 6000. Regra:
    // escolher o MAIOR valor numérico disponível entre os campos conhecidos.
    const display = item.item_card_display_sold_count;
    const displayPlacementNum =
      typeof display?.placement_sold_count === "number" ? display.placement_sold_count : null;
    const soldCandidates: number[] = [
      item.historical_sold,
      item.historical_sold_count,
      item.global_sold_count,
      item.sold_count,
      item.sold,
      display?.historical_sold_count,
      display?.monthly_sold_count,
      displayPlacementNum,
    ]
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
    const soldRaw = soldCandidates.length > 0 ? Math.max(...soldCandidates) : null;

    // Log temporário para diagnóstico (remover após confirmar em produção).
    // Mostra todos os campos brutos + valor escolhido + label final.
    console.log("[shopee-pdp:sold]", {
      itemId: `${item.title?.slice(0, 40) ?? ""}`,
      raw: {
        historical_sold: item.historical_sold,
        historical_sold_count: item.historical_sold_count,
        global_sold_count: item.global_sold_count,
        sold_count: item.sold_count,
        sold: item.sold,
        display_placement: display?.placement_sold_count,
        display_historical: display?.historical_sold_count,
        display_monthly: display?.monthly_sold_count,
      },
      soldRaw,
      soldLabel: soldRaw != null ? formatSoldLabel(soldRaw) : null,
      source: "shopee_pdp_v4",
    });

    return {
      title: item.title ?? null,
      image,
      price: Number.isFinite(price) && (price ?? 0) > 0 ? price : null,
      priceBefore: Number.isFinite(priceBefore) && (priceBefore ?? 0) > 0 ? priceBefore : null,
      sold: soldRaw,
      soldLabel: soldRaw != null ? formatSoldLabel(soldRaw) : null,
    };

  } catch {
    return empty;
  }
}

/**
 * Humaniza a contagem de vendas no padrão que a Shopee exibe:
 * 30 → "30+", 300 → "300+", 1500 → "1,5 mil+", 30000 → "30 mil+".
 */
function formatSoldLabel(n: number): string {
  return formatSalesLabel(n) ?? String(n);
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

async function captureOne(
  ctx: CaptureContext,
  rawUrl: string,
  messageText: string,
): Promise<"inserted" | "updated" | "skipped"> {
  const platform = detectPlatform(rawUrl);
  if (!platform) return "skipped";

  const resolvedRaw = await resolveShortLink(rawUrl);
  // Remove qualquer código de afiliado/tracking de terceiros antes de gerar o nosso.
  const resolved = stripThirdPartyTracking(resolvedRaw);
  const finalPlatform = detectPlatform(resolved) ?? platform;
  const itemId = extractItemId(resolved, finalPlatform);

  // Dedup rápido por link bruto ou item_id neste canal.
  const { data: existing } = await ctx.supabase
    .from("products")
    .select("id, image_url, title, promo_price, original_price")
    .eq("user_id", ctx.userId)
    .eq("channel_id", ctx.channelId)
    .eq("platform", finalPlatform)
    .or(`item_id.eq.${itemId},raw_link.eq.${resolved}`)
    .limit(1)
    .maybeSingle();

  // Para Shopee, construímos uma URL canônica limpa (sem tracking) a partir do
  // shopId/itemId. Isso aumenta muito a taxa de sucesso do OG e da PDP API,
  // que costumam falhar quando a URL carrega parâmetros como mmp_pid/gads_t_sig.
  let canonicalUrl = resolved;
  if (finalPlatform === "shopee" && itemId.includes(".")) {
    const [shopId, iid] = itemId.split(".");
    canonicalUrl = `https://shopee.com.br/product/${shopId}/${iid}`;
  }

  // Enriquecimento (título/imagem/preço) via OpenGraph.
  const meta = await fetchOgMeta(canonicalUrl);
  const messageMeta = parseMessageMeta(messageText);
  let image = meta.image;
  let title = meta.title ?? messageMeta.title;
  let price = meta.price ?? messageMeta.price;
  let priceBefore: number | null = messageMeta.priceBefore;
  let sold: number | null = null;
  let soldLabel: string | null = null;

  if (finalPlatform === "shopee") {
    const pdp = await fetchShopeePdp(canonicalUrl);
    // A resposta estruturada da Shopee é sempre mais confiável que OG/mensagem.
    if (pdp.title) title = pdp.title;
    if (pdp.image) image = pdp.image;
    if (pdp.price) price = pdp.price;
    if (pdp.priceBefore) priceBefore = pdp.priceBefore;
    if (pdp.sold) sold = pdp.sold;
    if (pdp.soldLabel) soldLabel = pdp.soldLabel;
    if (!image) {
      // Fallback dedicado com WhatsApp-UA + validação de CDN Shopee.
      image = await scrapeShopeeImage(canonicalUrl, resolved).catch(() => null);
    }
  }

  // Fallback de vendas via texto original (quando PDP não retornou).
  if (sold == null && messageMeta.sold != null) {
    sold = messageMeta.sold;
    soldLabel = messageMeta.soldLabel;
  }

  // Se DE e POR forem iguais, não é desconto real — descarta o "DE".
  if (priceBefore != null && price != null && priceBefore <= price) priceBefore = null;

  // === Lógica inteligente de promoção ===
  // 1) Compara preço atual com o último preço salvo (queda histórica).
  // 2) Se o scraper não trouxe priceBefore, mas o preço caiu vs histórico,
  //    usa o preço antigo como "DE:".
  const prevPrice = existing?.promo_price != null ? Number(existing.promo_price) : null;
  const priceDropped = prevPrice != null && price != null && price < prevPrice;
  let effectiveOriginal = priceBefore;
  if (effectiveOriginal == null && priceDropped) {
    effectiveOriginal = prevPrice;
  }
  const isDiscount =
    effectiveOriginal != null && price != null && effectiveOriginal > price;
  const discountPct = isDiscount
    ? Math.round(((effectiveOriginal! - price!) / effectiveOriginal!) * 100)
    : null;
  const priceChanged =
    price != null && prevPrice != null && Number(prevPrice) !== Number(price);

  const affiliate = await buildAffiliateLink(ctx.supabase, ctx.userId, finalPlatform, resolved);
  const finalTitle = (title ?? existing?.title ?? "Produto capturado").slice(0, 300);

  const payload = {
    user_id: ctx.userId,
    channel_id: ctx.channelId,
    platform: finalPlatform,
    item_id: itemId,
    title: finalTitle,
    image_url: image ?? existing?.image_url ?? null,
    raw_link: resolved,
    affiliate_link: affiliate,
    original_price: effectiveOriginal,
    promo_price: price,
    discount_percentage: discountPct,
    is_discount: isDiscount,
    price_changed_at: priceChanged ? new Date().toISOString() : undefined,
    sales: sold,
    sales_label: soldLabel,
    availability: "active" as const,
    source: "monitor",
    source_group_jid: ctx.groupJid,
    source_group_name: ctx.groupName,
  };

  const { data: upserted, error } = await ctx.supabase
    .from("products")
    .upsert(payload as never, { onConflict: "user_id,channel_id,platform,item_id" })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[MONITOR] upsert error", error.message);
    return "skipped";
  }

  // Log de histórico de preço quando houver mudança real.
  const productId = upserted?.id ?? existing?.id ?? null;
  if (priceChanged && productId && price != null) {
    await ctx.supabase.from("product_price_history").insert({
      product_id: productId,
      old_price: prevPrice,
      new_price: price,
      old_original_price: existing?.original_price != null ? Number(existing.original_price) : null,
      new_original_price: effectiveOriginal,
      discount_percentage: discountPct,
    } as never);
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
        text,
      );
      stats[result]++;
    }
  }

  return stats;
}
