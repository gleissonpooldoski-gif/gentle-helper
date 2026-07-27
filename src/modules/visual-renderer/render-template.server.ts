/**
 * Motor oficial de renderização visual server-side.
 *
 * Entrada: template (elements + format), produto, userId (para logs).
 * Saída:   PNG (Uint8Array) rasterizado via @resvg/resvg-wasm.
 *
 * Isolado do pipeline de publicação — este lote (14A) apenas expõe o
 * renderizador; integrações WhatsApp/Instagram virão em lotes seguintes.
 *
 * Compatível com Cloudflare Workers: o WASM é importado como módulo estático e
 * pré-compilado no deploy, sem geração dinâmica de código em runtime.
 */
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasmModule from "@resvg/resvg-wasm/index_bg.wasm?module";
import type { VTElement, VTFormat } from "@/modules/visual-templates/presets";
import { FORMAT_SIZE } from "@/modules/visual-templates/presets";
import type { ProductLite } from "@/modules/visual-templates/bindings";
import { INTER_800_WOFF_BASE64 } from "@/modules/instagram-admin/assets/inter-800";
import { elementsToSvg } from "./fabric-to-svg.server";

let fontBuffer: Uint8Array | null = null;
let resvgInitPromise: Promise<void> | null = null;

function decodeBase64(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function ensureResvgInitialized(): Promise<void> {
  if (!resvgInitPromise) {
    resvgInitPromise = initWasm(resvgWasmModule as WebAssembly.Module).catch((error) => {
      resvgInitPromise = null;
      console.error(JSON.stringify({
        tag: "[VISUAL_RENDER]",
        event: "RESVG_WASM_INIT_FAILED",
        error: error instanceof Error ? error.message : String(error),
      }));
      throw error;
    });
  }
  await resvgInitPromise;
}

function ensureFont(): Uint8Array {
  if (!fontBuffer) {
    fontBuffer = decodeBase64(INTER_800_WOFF_BASE64);
  }
  return fontBuffer;
}

export interface RenderTemplateInput {
  userId: string;
  template: {
    elements: VTElement[];
    format: VTFormat;
    width?: number;
    height?: number;
  };
  product: ProductLite & { affiliate_link?: string | null };
}

export interface RenderTemplateResult {
  success: boolean;
  pngBuffer: Uint8Array | null;
  width: number;
  height: number;
  svgLength: number;
  error?: string;
}

export async function renderVisualTemplatePng(
  input: RenderTemplateInput,
): Promise<RenderTemplateResult> {
  const size = FORMAT_SIZE[input.template.format] ?? { w: 1080, h: 1920 };
  const W = input.template.width ?? size.w;
  const H = input.template.height ?? size.h;

  try {
    await ensureResvgInitialized();
    const svg = await elementsToSvg({
      elements: input.template.elements,
      width: W,
      height: H,
      product: input.product,
      affiliateLink: input.product.affiliate_link ?? null,
    });

    const font = ensureFont();
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: W },
      font: {
        fontBuffers: [font],
        loadSystemFonts: false,
        defaultFontFamily: "Inter",
      },
    });
    let png: Uint8Array;
    try {
      const rendered = resvg.render();
      try {
        png = rendered.asPng();
      } finally {
        rendered.free();
      }
    } finally {
      resvg.free();
    }

    console.log(
      JSON.stringify({
        tag: "[VISUAL_RENDER]",
        event: "OK",
        user_id: input.userId,
        format: input.template.format,
        w: W,
        h: H,
        svg_bytes: svg.length,
        png_bytes: png.byteLength,
        elements: input.template.elements.length,
      }),
    );

    return { success: true, pngBuffer: png, width: W, height: H, svgLength: svg.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(
      JSON.stringify({
        tag: "[VISUAL_RENDER]",
        event: "ERROR",
        user_id: input.userId,
        format: input.template.format,
        error: msg,
      }),
    );
    return { success: false, pngBuffer: null, width: W, height: H, svgLength: 0, error: msg };
  }
}
