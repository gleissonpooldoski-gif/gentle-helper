/**
 * Server-function controllers for Mercado Livre affiliate.
 * These are the RPC endpoints called from the UI.
 */
import { createServerFn } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateAffiliateInput } from "./validator";
import type { MLConnectionView } from "./service";

export const getMLConnection = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<MLConnectionView | null> => {
    const { getConnection } = await import("./service");
    return getConnection(context.supabase, context.userId);
  });

export const saveMLConnection = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: { affiliateLink: string; cookie?: string; clearCookie?: boolean }) => {
    const affiliateLink = String(input.affiliateLink ?? "").trim();
    const cookie = input.cookie ? String(input.cookie) : undefined;
    const check = validateAffiliateInput({ affiliateLink, cookie });
    if (!check.ok) throw new Error(check.errors.join(" "));
    return { affiliateLink, cookie, clearCookie: !!input.clearCookie };
  })
  .handler(async ({ data, context }): Promise<MLConnectionView> => {
    try {
      const { saveConnection } = await import("./service");
      return await saveConnection(context.supabase, context.userId, data);
    } catch (error) {
      console.error("affiliate_config_save_error", {
        endpoint: "saveMLConnection",
        userId: context.userId,
        platform: "mercado_livre",
        error: error instanceof Error ? error.message : String(error),
        occurredAt: new Date().toISOString(),
      });
      if (error instanceof Error && error.message.includes("SHOPEE_CONFIG_ENC_KEY")) {
        throw new Error("Não foi possível validar a conexão.");
      }
      throw new Error("Não foi possível salvar a configuração.");
    }
  });

export const buildMLAffiliateUrl = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: { productUrl: string }) => {
    const productUrl = String(input.productUrl ?? "").trim();
    if (!productUrl) throw new Error("productUrl é obrigatório.");
    return { productUrl };
  })
  .handler(async ({ data, context }) => {
    const { generateAffiliateUrl } = await import("./service");
    return generateAffiliateUrl(context.supabase, context.userId, data.productUrl);
  });
