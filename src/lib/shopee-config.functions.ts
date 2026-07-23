import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ShopeeConfigView } from "./shopee-config.server";

type ShopeeInput = { affiliateId: string; apiKey?: string; clearApiKey?: boolean };

export const getShopeeConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ShopeeConfigView | null> => {
    const { getShopeeConnection } = await import("./shopee-config.server");
    return getShopeeConnection(context.supabase, context.userId);
  });

export const saveShopeeConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ShopeeInput) => {
    const affiliateId = String(input.affiliateId ?? "").trim();
    if (!affiliateId || affiliateId.length > 128) throw new Error("Verifique os dados informados.");
    const apiKey = String(input.apiKey ?? "").trim();
    if (apiKey.length > 512) throw new Error("Verifique os dados informados.");
    return { affiliateId, apiKey: apiKey || undefined, clearApiKey: Boolean(input.clearApiKey) };
  })
  .handler(async ({ data, context }): Promise<ShopeeConfigView> => {
    try {
      const { saveShopeeConnection } = await import("./shopee-config.server");
      return await saveShopeeConnection(context.supabase, context.userId, data);
    } catch (error) {
      console.error("affiliate_config_save_error", {
        endpoint: "saveShopeeConfig",
        userId: context.userId,
        platform: "shopee",
        error: error instanceof Error ? error.message : String(error),
        occurredAt: new Date().toISOString(),
      });
      if (error instanceof Error && error.message === "AFFILIATE_ENCRYPTION_UNAVAILABLE") {
        throw new Error("Não foi possível validar a conexão.");
      }
      throw new Error("Não foi possível salvar a configuração.");
    }
  });

export const buildShopeeLinkForUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rawLink: string }) => {
    const rawLink = String(input.rawLink ?? "").trim();
    if (!rawLink) throw new Error("Link é obrigatório.");
    return { rawLink };
  })
  .handler(async ({ data, context }): Promise<{ affiliateLink: string; status: string }> => {
    const { getShopeeConnection } = await import("./shopee-config.server");
    const config = await getShopeeConnection(context.supabase, context.userId);
    if (!config?.affiliateId) throw new Error("Configure seu Shopee ID de Afiliado antes.");
    try {
      const url = new URL(data.rawLink);
      url.searchParams.set("af_id", config.affiliateId);
      return { affiliateLink: url.toString(), status: config.status };
    } catch {
      const separator = data.rawLink.includes("?") ? "&" : "?";
      return { affiliateLink: `${data.rawLink}${separator}af_id=${encodeURIComponent(config.affiliateId)}`, status: config.status };
    }
  });
