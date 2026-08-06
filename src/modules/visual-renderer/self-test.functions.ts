/**
 * Teste controlado (FASE 6 do Lote 14A).
 *
 * Chamável somente por usuário autenticado. Monta um template mínimo
 * 1080x1920 (fundo, imagem, título, price group) com um produto sintético
 * e retorna metadados do PNG gerado.
 *
 * NÃO grava no banco. NÃO publica em nenhum canal.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { VTElement } from "@/modules/visual-templates/presets";

export const runVisualRendererSelfTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { renderVisualTemplatePng } = await import("./render-template.server");
    const testElements: VTElement[] = [
      { id: "bg", type: "background", x: 0, y: 0, w: 1080, h: 1920, z: 0, props: { fill: "#fde047" } },
      { id: "hdr", type: "text", x: 60, y: 100, w: 960, h: 120, z: 1, props: { text: "⚡ OFERTA RELÂMPAGO", font: "Inter", size: 78, weight: 900, color: "#111111", align: "center" } },
      { id: "card", type: "shape", x: 60, y: 260, w: 960, h: 1100, z: 2, props: { fill: "#ffffff", radius: 32 } },
      { id: "img", type: "product_image", x: 140, y: 320, w: 800, h: 700, z: 3, props: {} },
      { id: "ttl", type: "text", x: 100, y: 1050, w: 880, h: 200, z: 4, props: { bind: "{{title}}", font: "Inter", size: 56, weight: 800, color: "#111111", align: "center" } },
      { id: "sales", type: "sold", x: 100, y: 1260, w: 880, h: 60, z: 5, props: { bind: "{{sales}} vendidos", font: "Inter", size: 40, weight: 600, color: "#374151", align: "center" } },
      { id: "price", type: "price", x: 60, y: 1440, w: 960, h: 260, z: 6, props: { mode: "both", bg: "#dc2626", color: "#ffffff", radius: 32 } },
    ];
    const result = await renderVisualTemplatePng({
      userId: context.userId,
      template: { elements: testElements, format: "ig_story" },
      product: {
        id: "test",
        title: "Produto Teste Shopee",
        image_url: null,
        original_price: 99.93,
        promo_price: 29.98,
        sales: 12500,
        sales_label: "12,5 mil",
        store_name: "Loja Teste",
        affiliate_link: null,
      },
    });
    return {
      success: result.success,
      width: result.width,
      height: result.height,
      png_bytes: result.pngBuffer ? result.pngBuffer.byteLength : 0,
      svg_bytes: result.svgLength,
      error: result.error ?? null,
    };
  });
