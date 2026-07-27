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
import UPNG from "upng-js";
import { decode as decodeJpeg } from "jpeg-js";
import { parse, type Font } from "opentype.js";
import { INTER_800_WOFF_BASE64 } from "./assets/inter-800";
import { publishStory } from "./graph.server";
import {
  STORY_W,
  STORY_H,
  PROD_ZONE,
  TITLE_ZONE,
  PRICE_BAR_ZONE,
  POR_FONT_SIZE,
  PRICE_FONT_SIZE_WITH_DE,
  PRICE_FONT_SIZE_NO_DE,
  DE_FONT_SIZE,
  DE_BASELINE_OFFSET,
  PRICE_CENTER_Y_OFFSET_WITH_DE,
  TITLE_LINE_HEIGHT,
  PRICE_TEXT_COLOR,
  DEFAULT_TITLE_COLOR,
  DEFAULT_BG_COLOR,
  DE_STRIKE_WIDTH,
  wrapTitleLines,
  formatBRL,
} from "./story-layout";

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

async function fetchBitmap(url: string, label: string): Promise<Bitmap | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36",
        accept: "image/*,*/*;q=0.8",
      },
    });
    if (!res.ok) {
      console.log("[COMPOSE_FETCH_FAIL]", { label, status: res.status });
      return null;
    }
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    const bytes = new Uint8Array(await res.arrayBuffer());
    // Sniff magic bytes so odd content-types (application/octet-stream, etc.)
    // still decode correctly instead of silently falling back to yellow.
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    try {
      const decoded = isPng || (contentType.includes("png") && !isJpg)
        ? PNG.sync.read(Buffer.from(bytes))
        : decodeJpeg(Buffer.from(bytes), { useTArray: true, formatAsRGBA: true });
      const bitmap = make(decoded.width, decoded.height);
      bitmap.data.set(decoded.data);
      console.log("[COMPOSE_FETCH_OK]", { label, w: decoded.width, h: decoded.height, isPng, isJpg });
      return bitmap;
    } catch (decodeErr: any) {
      console.log("[COMPOSE_DECODE_FAIL]", {
        label,
        contentType,
        isPng,
        isJpg,
        bytes: bytes.byteLength,
        error: String(decodeErr?.message ?? decodeErr),
      });
      return null;
    }
  } catch (fetchErr: any) {
    console.log("[COMPOSE_FETCH_ERROR]", { label, error: String(fetchErr?.message ?? fetchErr) });
    return null;
  }
}

function drawTextAt(
  ctx: ReturnType<Bitmap["getContext"]>,
  font: Font,
  text: string,
  x: number,
  baselineY: number,
  size: number,
  color: string,
): number {
  const width = font.getAdvanceWidth(text, size);
  ctx.fillStyle = color;
  font.getPath(text, x, baselineY, size).draw(ctx as never);
  return width;
}

function drawCenteredText(
  ctx: ReturnType<Bitmap["getContext"]>,
  font: Font,
  text: string,
  centerX: number,
  baselineY: number,
  size: number,
  color: string,
): number {
  const width = font.getAdvanceWidth(text, size);
  drawTextAt(ctx, font, text, centerX - width / 2, baselineY, size, color);
  return width;
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

  const [templateBitmap, productBitmap] = await Promise.all([
    input.templateUrl ? fetchBitmap(input.templateUrl, "template") : Promise.resolve(null),
    input.product.image_url ? fetchBitmap(input.product.image_url, "product") : Promise.resolve(null),
  ]);

  const titleColor = input.titleColor || DEFAULT_TITLE_COLOR;
  const rawTitle = (input.product.title ?? "").trim();

  // LOTE 17A: DE/POR decidido EXCLUSIVAMENTE pela camada central.
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

  const output = make(STORY_W, STORY_H);
  const ctx = output.getContext("2d");

  if (templateBitmap) {
    const scale = Math.max(STORY_W / templateBitmap.width, STORY_H / templateBitmap.height);
    const drawW = templateBitmap.width * scale;
    const drawH = templateBitmap.height * scale;
    ctx.drawImage(templateBitmap, (STORY_W - drawW) / 2, (STORY_H - drawH) / 2, drawW, drawH);
  } else {
    ctx.fillStyle = DEFAULT_BG_COLOR;
    ctx.fillRect(0, 0, STORY_W, STORY_H);
  }

  if (productBitmap) {
    const scale = Math.min(PROD_ZONE.w / productBitmap.width, PROD_ZONE.h / productBitmap.height);
    const drawW = productBitmap.width * scale;
    const drawH = productBitmap.height * scale;
    ctx.drawImage(
      productBitmap,
      PROD_ZONE.x + (PROD_ZONE.w - drawW) / 2,
      PROD_ZONE.y + (PROD_ZONE.h - drawH) / 2,
      drawW,
      drawH,
    );
  }

  // Title — same wrap/shrink algorithm as the manual canvas, using opentype
  // advance widths as the measurement fn.
  if (rawTitle) {
    const { lines, size } = wrapTitleLines(rawTitle, (text, s) =>
      font.getAdvanceWidth(text, s),
    );
    const lineH = size * TITLE_LINE_HEIGHT;
    const totalH = lineH * lines.length;
    // Manual uses textBaseline="middle"; opentype draws at baseline, so we
    // approximate middle by offsetting by size*0.35 (Inter ex-height ~0.7).
    const startMiddleY = TITLE_ZONE.y + (TITLE_ZONE.h - totalH) / 2 + lineH / 2;
    lines.forEach((ln, i) => {
      const baselineY = startMiddleY + i * lineH + size * 0.35;
      drawCenteredText(ctx, font, ln, TITLE_ZONE.x + TITLE_ZONE.w / 2, baselineY, size, titleColor);
    });
  }

  // Price — mirrors stories.tsx drawPrice(): "POR" small + big price laid
  // out left-aligned but as a group centered horizontally in PRICE_BAR_ZONE.
  if (priceStr) {
    const barCenterX = PRICE_BAR_ZONE.x + PRICE_BAR_ZONE.w / 2;

    if (hasDiscount) {
      const deStr = `DE ${formatBRL(original)}`;
      const deBaselineY = PRICE_BAR_ZONE.y + DE_BASELINE_OFFSET + DE_FONT_SIZE * 0.35;
      const deWidth = drawCenteredText(
        ctx, font, deStr, barCenterX, deBaselineY, DE_FONT_SIZE, PRICE_TEXT_COLOR,
      );
      // strike-through at the middle line (matches manual: moveTo(deY))
      const strikeY = PRICE_BAR_ZONE.y + DE_BASELINE_OFFSET;
      ctx.strokeStyle = PRICE_TEXT_COLOR;
      ctx.lineWidth = DE_STRIKE_WIDTH;
      ctx.beginPath();
      ctx.moveTo(barCenterX - deWidth / 2, strikeY);
      ctx.lineTo(barCenterX + deWidth / 2, strikeY);
      ctx.stroke();
    }

    const priceSize = hasDiscount ? PRICE_FONT_SIZE_WITH_DE : PRICE_FONT_SIZE_NO_DE;
    const porW = font.getAdvanceWidth("POR ", POR_FONT_SIZE);
    const priceW = font.getAdvanceWidth(priceStr, priceSize);
    const totalW = porW + priceW;
    const startX = PRICE_BAR_ZONE.x + (PRICE_BAR_ZONE.w - totalW) / 2;

    const middleY = hasDiscount
      ? PRICE_BAR_ZONE.y + PRICE_BAR_ZONE.h + PRICE_CENTER_Y_OFFSET_WITH_DE
      : PRICE_BAR_ZONE.y + PRICE_BAR_ZONE.h / 2;

    // Align "POR" and priceStr on the same visual middle line.
    const porBaselineY = middleY + POR_FONT_SIZE * 0.35;
    const priceBaselineY = middleY + priceSize * 0.35;
    drawTextAt(ctx, font, "POR", startX, porBaselineY, POR_FONT_SIZE, PRICE_TEXT_COLOR);
    drawTextAt(ctx, font, priceStr, startX + porW, priceBaselineY, priceSize, PRICE_TEXT_COLOR);
  }

  const pngImage = new PNG({ width: STORY_W, height: STORY_H });
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
