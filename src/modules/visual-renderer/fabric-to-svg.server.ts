/**
 * Converte VTElement[] (formato do editor visual, ver
 * `src/modules/visual-templates/presets.ts`) em uma string SVG pronta para
 * rasterização pelo @resvg/resvg-wasm.
 *
 * IMPORTANTE:
 * - Runtime seguro para Cloudflare Workers (sem DOM, sem Node-only APIs).
 * - Imagens externas são baixadas com timeout e embutidas como data URL.
 *   Falhas caem em um placeholder cinza silencioso (fallback seguro).
 * - Textos com `bind` são resolvidos via `resolveProduct` (bindings.ts).
 */
import type { VTElement } from "@/modules/visual-templates/presets";
import { resolveProduct, type ProductLite, type ResolvedProduct } from "@/modules/visual-templates/bindings";

const IMAGE_FETCH_TIMEOUT_MS = 4000;

// ---------- helpers ----------

export function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  if (!url) return null;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
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
  } finally {
    clearTimeout(to);
  }
}

// Bindings: {{title}}, {{price}}, {{original_price}}, {{discount}},
// {{sold_text}}/{{sales}}, {{store}}, {{affiliate_link}}
function resolveBindings(raw: string, r: ResolvedProduct, affiliateLink?: string | null): string {
  return raw
    .replaceAll("{{title}}", r.title)
    .replaceAll("{{price}}", r.price)
    .replaceAll("{{original_price}}", r.original)
    .replaceAll("{{discount}}", r.discount)
    .replaceAll("{{sold_text}}", r.sold)
    .replaceAll("{{sales}}", r.sold)
    .replaceAll("{{store}}", r.store)
    .replaceAll("{{affiliate_link}}", affiliateLink ?? "");
}

function textOf(el: VTElement, r: ResolvedProduct, affiliateLink?: string | null): string {
  const p = el.props as { bind?: string; text?: string };
  const raw = p.bind ? p.bind : (p.text ?? "");
  return resolveBindings(raw, r, affiliateLink);
}

// wrap por contagem de caracteres (heurística determinística, sem métricas server-side)
function wrapText(text: string, maxCharsPerLine: number, maxLines = 3): string[] {
  const words = text.split(/\s+/).filter(Boolean);
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
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/[.,;\s]+$/, "") + "…";
    return kept;
  }
  return lines;
}

// ---------- element renderers ----------

function renderRect(el: VTElement): string {
  const p = el.props as { fill?: string; radius?: number; opacity?: number };
  const rx = p.radius ?? 0;
  const opacity = p.opacity ?? 1;
  return `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" rx="${rx}" ry="${rx}" fill="${p.fill ?? "#ffffff"}" opacity="${opacity}"/>`;
}

function renderText(el: VTElement, content: string): string {
  const p = el.props as {
    font?: string;
    size?: number;
    weight?: number;
    color?: string;
    align?: "left" | "center" | "right";
    opacity?: number;
    linethrough?: boolean;
  };
  const size = p.size ?? 40;
  const weight = p.weight ?? 700;
  const color = p.color ?? "#111111";
  const font = p.font ?? "Inter";
  const align = p.align ?? "left";
  const opacity = p.opacity ?? 1;
  const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
  const anchorX = align === "center" ? el.x + el.w / 2 : align === "right" ? el.x + el.w : el.x;

  // Wrap ~ (largura_box / (size * 0.55)) caracteres por linha
  const approxCharsPerLine = Math.max(6, Math.floor(el.w / (size * 0.55)));
  const lines = wrapText(content, approxCharsPerLine, 3);
  const lineH = size * 1.15;
  const totalH = lineH * lines.length;
  const startY = el.y + (el.h - totalH) / 2 + size * 0.85;

  const deco = p.linethrough ? ` text-decoration="line-through"` : "";
  const tspans = lines
    .map(
      (ln, i) =>
        `<text x="${anchorX}" y="${startY + i * lineH}" font-size="${size}" font-family="${font}, sans-serif" font-weight="${weight}" fill="${color}" text-anchor="${anchor}" opacity="${opacity}"${deco}>${escapeXml(ln)}</text>`,
    )
    .join("");
  return tspans;
}

async function renderImage(el: VTElement, src: string | null): Promise<string> {
  const data = src ? await fetchAsDataUrl(src) : null;
  if (!data) {
    // placeholder cinza silencioso
    return `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" fill="#f3f4f6" stroke="#9ca3af" stroke-dasharray="8,8"/>`;
  }
  return `<image href="${data}" x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" preserveAspectRatio="xMidYMid meet"/>`;
}

function renderPriceGroup(el: VTElement, r: ResolvedProduct): string {
  const p = el.props as { bg?: string; color?: string; mode?: string; radius?: number };
  const bg = p.bg ?? "#dc2626";
  const color = p.color ?? "#ffffff";
  const mode = p.mode ?? "both";
  const radius = p.radius ?? 24;

  const parts: string[] = [];
  parts.push(
    `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" rx="${radius}" ry="${radius}" fill="${bg}"/>`,
  );
  const cx = el.x + el.w / 2;

  if (mode !== "por" && r.hasOriginal && r.original) {
    const deStr = `DE ${r.original}`;
    const deY = el.y + 60;
    const approxW = deStr.length * 20;
    parts.push(
      `<text x="${cx}" y="${deY}" font-size="42" font-weight="700" font-family="Inter, sans-serif" fill="${color}" text-anchor="middle">${escapeXml(deStr)}</text>`,
      `<line x1="${cx - approxW / 2}" y1="${deY - 8}" x2="${cx + approxW / 2}" y2="${deY - 8}" stroke="${color}" stroke-width="4"/>`,
    );
    const priceY = el.y + el.h - 40;
    parts.push(
      `<text x="${cx}" y="${priceY}" font-size="92" font-weight="900" font-family="Inter, sans-serif" fill="${color}" text-anchor="middle">POR ${escapeXml(r.price)}</text>`,
    );
  } else {
    const priceY = el.y + el.h / 2 + 30;
    parts.push(
      `<text x="${cx}" y="${priceY}" font-size="100" font-weight="900" font-family="Inter, sans-serif" fill="${color}" text-anchor="middle">POR ${escapeXml(r.price)}</text>`,
    );
  }
  return parts.join("");
}

// ---------- main ----------

export interface FabricToSvgInput {
  elements: VTElement[];
  width: number;
  height: number;
  product?: ProductLite | null;
  affiliateLink?: string | null;
}

export async function elementsToSvg(input: FabricToSvgInput): Promise<string> {
  const r = resolveProduct(input.product ?? null);
  const sorted = [...input.elements].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));

  const body: string[] = [];
  for (const el of sorted) {
    switch (el.type) {
      case "background":
      case "shape":
        body.push(renderRect(el));
        break;

      case "image":
      case "logo":
        body.push(await renderImage(el, (el.props as { src?: string }).src ?? null));
        break;

      case "product_image":
        body.push(await renderImage(el, r.image_url || null));
        break;

      case "price":
        body.push(renderPriceGroup(el, r));
        break;

      case "discount":
        body.push(
          renderText(
            { ...el, props: { ...el.props, size: (el.props as { size?: number }).size ?? 72, weight: 900 } },
            r.discount || "-20%",
          ),
        );
        break;

      case "text":
      case "textbox" as VTElement["type"]:
      case "sold":
      case "store":
      case "rating":
      case "buy_button":
      case "free_text": {
        const content = textOf(el, r, input.affiliateLink);
        if (content) body.push(renderText(el, content));
        break;
      }

      default:
        // tipo desconhecido: ignora silenciosamente
        break;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}">${body.join("")}</svg>`;
}
