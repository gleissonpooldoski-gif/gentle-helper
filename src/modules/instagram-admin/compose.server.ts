/**
 * Server-side Story composition (1080x1920).
 *
 * Composes the template background + product photo + title + "POR R$ ..."
 * price into a PNG, then uploads to Supabase Storage and publishes via the
 * Instagram Graph API. Used by BOTH:
 *  - the recurring schedule cron (`/api/public/hooks/instagram-tick`)
 *  - the "Publicar agora" button (`runAdminStoryScheduleNow`)
 *
 * Rendering pipeline: build an SVG string, rasterize with @resvg/resvg-wasm.
 * WASM binary is bundled from the installed @resvg/resvg-wasm package via a
 * Vite/Nitro `.wasm` import (resolves to a WebAssembly.Module in the Worker),
 * and the Inter 800 font is base64-inlined at build time. No runtime CDN
 * fetches — the previous unpkg/jsdelivr dependency 404'd and broke Stories.
 */
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { RESVG_WASM_BASE64 } from "./assets/resvg-wasm";
import { INTER_800_WOFF_BASE64 } from "./assets/inter-800";
import { publishStory } from "./graph.server";

let wasmReady: Promise<void> | null = null;
let fontBuffer: Uint8Array | null = null;

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function ensureReady() {
  if (!wasmReady) {
    wasmReady = (async () => {
      const bytes = decodeBase64(RESVG_WASM_BASE64);
      await initWasm(new WebAssembly.Module(bytes.buffer as ArrayBuffer));
    })();

  }
  await wasmReady;
  if (!fontBuffer) {
    fontBuffer = decodeBase64(INTER_800_WOFF_BASE64);
  }
}



async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36",
        accept: "image/*,*/*;q=0.8",
      },
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "image/jpeg";
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return `data:${ct};base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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
  };
};

export async function composeStoryPng(input: ComposeInput): Promise<Uint8Array> {
  await ensureReady();

  const W = 1080;
  const H = 1920;
  const PROD = { x: 180, y: 470, w: 720, h: 640 };
  const TITLE = { x: 90, y: 1130, w: 900, h: 170 };
  const PRICE = { x: 90, y: 1310, w: 900, h: 170 };

  const [tplData, prodData] = await Promise.all([
    input.templateUrl ? fetchAsDataUrl(input.templateUrl) : Promise.resolve(null),
    input.product.image_url ? fetchAsDataUrl(input.product.image_url) : Promise.resolve(null),
  ]);

  const titleColor = input.titleColor || "#111111";
  const rawTitle = (input.product.title ?? "").trim();
  const titleLines = rawTitle ? wrapTitle(rawTitle, 32) : [];

  const promo = input.product.promo_price;
  const original = input.product.original_price;
  const hasDiscount =
    promo != null && original != null && Number(original) > Number(promo);
  const priceStr = formatBRL(promo ?? original ?? null);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
  );
  // Background: template or yellow fallback
  if (tplData) {
    parts.push(
      `<image href="${tplData}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`,
    );
  } else {
    parts.push(`<rect width="${W}" height="${H}" fill="#fde047"/>`);
  }

  // Product photo — fit inside PROD box preserving aspect ratio
  if (prodData) {
    parts.push(
      `<image href="${prodData}" x="${PROD.x}" y="${PROD.y}" width="${PROD.w}" height="${PROD.h}" preserveAspectRatio="xMidYMid meet"/>`,
    );
  }

  // Title (up to 2 lines, centered in TITLE box)
  if (titleLines.length) {
    const size = titleLines.some((l) => l.length > 24) ? 50 : 58;
    const lineH = size * 1.15;
    const total = lineH * titleLines.length;
    const startY = TITLE.y + (TITLE.h - total) / 2 + size * 0.85;
    parts.push(
      `<g font-family="Inter, sans-serif" font-weight="800" fill="${titleColor}" text-anchor="middle">`,
    );
    titleLines.forEach((ln, i) => {
      parts.push(
        `<text x="${TITLE.x + TITLE.w / 2}" y="${startY + i * lineH}" font-size="${size}">${escapeXml(ln)}</text>`,
      );
    });
    parts.push(`</g>`);
  }

  // Price bar overlay (white text over template's purple bar)
  if (priceStr) {
    parts.push(
      `<g font-family="Inter, sans-serif" fill="#ffffff" text-anchor="middle">`,
    );
    if (hasDiscount) {
      const deStr = `DE ${formatBRL(original)}`;
      const deY = PRICE.y + 48;
      const cx = PRICE.x + PRICE.w / 2;
      const approxW = deStr.length * 20; // ~char width @ 42px 700
      parts.push(
        `<text x="${cx}" y="${deY}" font-size="42" font-weight="700">${escapeXml(deStr)}</text>`,
        `<line x1="${cx - approxW / 2}" y1="${deY - 8}" x2="${cx + approxW / 2}" y2="${deY - 8}" stroke="#ffffff" stroke-width="4"/>`,
      );
      const centerY = PRICE.y + PRICE.h - 30;
      parts.push(
        `<text x="${cx}" y="${centerY}" font-size="92" font-weight="900">POR ${escapeXml(priceStr)}</text>`,
      );
    } else {
      const centerY = PRICE.y + PRICE.h / 2 + 20;
      const cx = PRICE.x + PRICE.w / 2;
      parts.push(
        `<text x="${cx}" y="${centerY}" font-size="110" font-weight="900">POR ${escapeXml(priceStr)}</text>`,
      );
    }
    parts.push(`</g>`);
  }

  parts.push(`</svg>`);
  const svg = parts.join("");

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: W },
    font: {
      fontBuffers: fontBuffer ? [fontBuffer] : [],
      loadSystemFonts: false,
      defaultFontFamily: "Inter",
    },
  });
  const png = resvg.render().asPng();
  return png;
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
