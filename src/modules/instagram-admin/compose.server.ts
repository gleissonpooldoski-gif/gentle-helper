/**
 * Server-side Story composition (1080x1920).
 *
 * Composes the template background + product photo + title + "POR R$ ..."
 * price into a PNG, then uploads to Supabase Storage and publishes via the
 * Instagram Graph API. Used by BOTH:
 *  - the recurring schedule cron (`/api/public/hooks/instagram-tick`)
 *  - the "Publicar agora" button (`runAdminStoryScheduleNow`)
 *
 * Rendering pipeline: pure JavaScript bitmap composition. No WASM is loaded,
 * which keeps the scheduled path compatible with the production Worker.
 */
import { make, type Bitmap } from "pureimage";
import { PNG } from "pngjs";
import { decode as decodeJpeg } from "jpeg-js";
import { parse, type Font } from "opentype.js";
import { INTER_800_WOFF_BASE64 } from "./assets/inter-800";
import { publishStory } from "./graph.server";

let storyFont: Font | null = null;

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function ensureFont(): Font {
  if (!storyFont) {
    const bytes = decodeBase64(INTER_800_WOFF_BASE64);
    storyFont = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }
  return storyFont;
}





async function fetchBitmap(url: string): Promise<Bitmap | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36",
        accept: "image/*,*/*;q=0.8",
      },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const bytes = new Uint8Array(await res.arrayBuffer());
    const decoded = contentType.includes("png")
      ? PNG.sync.read(bytes)
      : decodeJpeg(Buffer.from(bytes), { useTArray: true, formatAsRGBA: true });
    const bitmap = make(decoded.width, decoded.height);
    bitmap.data.set(decoded.data);
    return bitmap;
  } catch {
    return null;
  }
}

function drawCenteredText(
  ctx: ReturnType<Bitmap["getContext"]>,
  font: Font,
  text: string,
  centerX: number,
  baselineY: number,
  size: number,
  color: string,
) {
  const width = font.getAdvanceWidth(text, size);
  ctx.fillStyle = color;
  font.getPath(text, centerX - width / 2, baselineY, size).draw(ctx as never);
  return width;
}

function formatBRL(n: number | null | undefined): string {
  if (n == null) return "";
  return `R$ ${Number(n).toFixed(2).replace(".", ",")}`;
}

// Wrap by character count — cheap heuristic since we don't have text metrics
// server-side without measuring. Keeps titles readable in 2 lines.
function wrapTitle(title: string, maxCharsPerLine: number): string[] {
  const words = title.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (test.length > maxCharsPerLine && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

export type ComposeInput = {
  templateUrl: string | null;
  titleColor?: string;
  product: {
    title?: string | null;
    image_url?: string | null;
    promo_price?: number | null;
    original_price?: number | null;
    // LOTE 17A: campos necessários à camada central de qualidade.
    platform?: string | null;
    price_quality?: string | null;
  };
};

export async function composeStoryPng(input: ComposeInput): Promise<Uint8Array> {
  const font = ensureFont();

  const W = 1080;
  const H = 1920;
  const PROD = { x: 180, y: 470, w: 720, h: 640 };
  const TITLE = { x: 90, y: 1130, w: 900, h: 170 };
  const PRICE = { x: 90, y: 1310, w: 900, h: 170 };

  const [templateBitmap, productBitmap] = await Promise.all([
    input.templateUrl ? fetchBitmap(input.templateUrl) : Promise.resolve(null),
    input.product.image_url ? fetchBitmap(input.product.image_url) : Promise.resolve(null),
  ]);

  const titleColor = input.titleColor || "#111111";
  const rawTitle = (input.product.title ?? "").trim();
  const titleLines = rawTitle ? wrapTitle(rawTitle, 32) : [];

  // LOTE 17A: DE/POR decidido EXCLUSIVAMENTE pela camada central.
  // Nunca comparar original_price > promo_price diretamente.
  const { resolveProductDisplay } = await import("@/modules/products/display-resolver");
  const disp = resolveProductDisplay({
    title: input.product.title ?? null,
    platform: input.product.platform ?? null,
    promo_price: input.product.promo_price ?? null,
    original_price: input.product.original_price ?? null,
    price_quality: input.product.price_quality ?? null,
  });
  const promo = disp.priceCurrentDisplay ?? input.product.promo_price ?? null;
  const original = disp.priceOriginalDisplay;
  const hasDiscount = original != null;
  const priceStr = formatBRL(promo ?? input.product.original_price ?? null);


  const output = make(W, H);
  const ctx = output.getContext("2d");

  if (templateBitmap) {
    const scale = Math.max(W / templateBitmap.width, H / templateBitmap.height);
    const drawW = templateBitmap.width * scale;
    const drawH = templateBitmap.height * scale;
    ctx.drawImage(templateBitmap, (W - drawW) / 2, (H - drawH) / 2, drawW, drawH);
  } else {
    ctx.fillStyle = "#fde047";
    ctx.fillRect(0, 0, W, H);
  }

  if (productBitmap) {
    const scale = Math.min(PROD.w / productBitmap.width, PROD.h / productBitmap.height);
    const drawW = productBitmap.width * scale;
    const drawH = productBitmap.height * scale;
    ctx.drawImage(
      productBitmap,
      PROD.x + (PROD.w - drawW) / 2,
      PROD.y + (PROD.h - drawH) / 2,
      drawW,
      drawH,
    );
  }

  if (titleLines.length) {
    const size = titleLines.some((l) => l.length > 24) ? 50 : 58;
    const lineH = size * 1.15;
    const total = lineH * titleLines.length;
    const startY = TITLE.y + (TITLE.h - total) / 2 + size * 0.85;
    titleLines.forEach((ln, i) => {
      drawCenteredText(ctx, font, ln, TITLE.x + TITLE.w / 2, startY + i * lineH, size, titleColor);
    });
  }

  if (priceStr) {
    const centerX = PRICE.x + PRICE.w / 2;
    if (hasDiscount) {
      const deStr = `DE ${formatBRL(original)}`;
      const deY = PRICE.y + 48;
      const deWidth = drawCenteredText(ctx, font, deStr, centerX, deY, 42, "#ffffff");
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(centerX - deWidth / 2, deY - 8);
      ctx.lineTo(centerX + deWidth / 2, deY - 8);
      ctx.stroke();
      const centerY = PRICE.y + PRICE.h - 30;
      drawCenteredText(ctx, font, `POR ${priceStr}`, centerX, centerY, 92, "#ffffff");
    } else {
      const centerY = PRICE.y + PRICE.h / 2 + 20;
      drawCenteredText(ctx, font, `POR ${priceStr}`, centerX, centerY, 110, "#ffffff");
    }
  }

  const pngImage = new PNG({ width: W, height: H });
  pngImage.data = Buffer.from(output.data);
  const png = PNG.sync.write(pngImage);
  return new Uint8Array(png.buffer, png.byteOffset, png.byteLength);
}

/**
 * Uploads a composed PNG to Supabase storage and publishes it as a Story.
 * Returns the Instagram media id.
 */
export async function uploadAndPublishStory(input: {
  pngBytes: Uint8Array;
  igId: string;
  token: string;
}): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const filename = `story-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const { error: upErr } = await (supabaseAdmin as any).storage
    .from("story-images")
    .upload(filename, input.pngBytes, {
      contentType: "image/png",
      upsert: false,
    });
  if (upErr) throw upErr;
  const { data: signed, error: signErr } = await (supabaseAdmin as any).storage
    .from("story-images")
    .createSignedUrl(filename, 60 * 60);
  if (signErr) throw signErr;
  return publishStory({
    igId: input.igId,
    token: input.token,
    imageUrl: signed.signedUrl,
  });
}
