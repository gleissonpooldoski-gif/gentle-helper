/**
 * Preview server-side de um template visual aplicado a um produto real.
 *
 * NÃO grava imagem em storage. NÃO publica em nenhum canal.
 * Retorna PNG em base64 para o editor renderizar num <img>.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { VTElement, VTFormat } from "@/modules/visual-templates/presets";
import { renderVisualTemplatePng } from "./render-template.server";
import { resolveVisualTemplateForProduct } from "@/modules/visual-templates/resolve.server";

function bufferToBase64(buf: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export const previewVisualTemplateForProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { templateId: string; productId: string }) =>
    z
      .object({
        templateId: z.string().uuid(),
        productId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: tpl, error: tplErr } = await context.supabase
      .from("visual_templates")
      .select("id,format,elements")
      .eq("id", data.templateId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (tplErr || !tpl) {
      return {
        success: false,
        imageBase64: null,
        width: 0,
        height: 0,
        error: tplErr?.message ?? "Template não encontrado",
      };
    }

    const { data: prod, error: prodErr } = await context.supabase
      .from("products")
      .select(
        "id,title,image_url,original_price,promo_price,sales,sales_label,store_name,affiliate_link",
      )
      .eq("id", data.productId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (prodErr || !prod) {
      return {
        success: false,
        imageBase64: null,
        width: 0,
        height: 0,
        error: prodErr?.message ?? "Produto não encontrado",
      };
    }

    const elements = Array.isArray(tpl.elements) ? (tpl.elements as unknown as VTElement[]) : [];
    const result = await renderVisualTemplatePng({
      userId: context.userId,
      template: { elements, format: tpl.format as VTFormat },
      product: {
        id: prod.id,
        title: prod.title,
        image_url: prod.image_url,
        original_price: prod.original_price,
        promo_price: prod.promo_price,
        sales: prod.sales,
        sales_label: prod.sales_label,
        store_name: prod.store_name,
        affiliate_link: prod.affiliate_link,
      },
    });

    if (!result.success || !result.pngBuffer) {
      return {
        success: false,
        imageBase64: null,
        width: result.width,
        height: result.height,
        error: result.error ?? "Falha ao renderizar",
      };
    }

    return {
      success: true,
      imageBase64: bufferToBase64(result.pngBuffer),
      width: result.width,
      height: result.height,
      error: null,
    };
  });

/**
 * Preview que resolve o template ativo (channel → user → global) para o
 * produto informado. Útil para verificar qual arte será publicada.
 */
export const previewActiveVisualTemplateForProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { productId: string; format: "ig_story" | "ig_post" | "whatsapp" }) =>
    z
      .object({
        productId: z.string().uuid(),
        format: z.enum(["ig_story", "ig_post", "whatsapp"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: prod, error: prodErr } = await context.supabase
      .from("products")
      .select(
        "id,title,image_url,original_price,promo_price,sales,sales_label,store_name,affiliate_link,channel_id",
      )
      .eq("id", data.productId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (prodErr || !prod) {
      return {
        success: false,
        source: "none" as const,
        templateId: null,
        imageBase64: null,
        width: 0,
        height: 0,
        error: prodErr?.message ?? "Produto não encontrado",
      };
    }

    const resolved = await resolveVisualTemplateForProduct(context.supabase, {
      userId: context.userId,
      channelId: prod.channel_id,
      format: data.format,
    });
    if (!resolved.template) {
      return {
        success: false,
        source: resolved.source,
        templateId: null,
        imageBase64: null,
        width: 0,
        height: 0,
        error: "Nenhum template disponível para este formato",
      };
    }

    const elements = Array.isArray(resolved.template.elements)
      ? (resolved.template.elements as unknown as VTElement[])
      : [];
    const result = await renderVisualTemplatePng({
      userId: context.userId,
      template: { elements, format: resolved.template.format as VTFormat },
      product: {
        id: prod.id,
        title: prod.title,
        image_url: prod.image_url,
        original_price: prod.original_price,
        promo_price: prod.promo_price,
        sales: prod.sales,
        sales_label: prod.sales_label,
        store_name: prod.store_name,
        affiliate_link: prod.affiliate_link,
      },
    });

    return {
      success: result.success,
      source: resolved.source,
      templateId: resolved.template.id,
      imageBase64: result.pngBuffer ? bufferToBase64(result.pngBuffer) : null,
      width: result.width,
      height: result.height,
      error: result.error ?? null,
    };
  });
