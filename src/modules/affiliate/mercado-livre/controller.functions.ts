/**
 * Server-function controllers for Mercado Livre affiliate.
 * These are the RPC endpoints called from the UI.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateAffiliateInput } from "./validator";
import {
  getConnection,
  saveConnection,
  generateAffiliateUrl,
  type MLConnectionView,
} from "./service";

export const getMLConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MLConnectionView | null> => {
    return getConnection(context.supabase, context.userId);
  });

export const saveMLConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { affiliateLink: string; cookie?: string; clearCookie?: boolean }) => {
    const affiliateLink = String(input.affiliateLink ?? "").trim();
    const cookie = input.cookie ? String(input.cookie) : undefined;
    const check = validateAffiliateInput({ affiliateLink, cookie });
    if (!check.ok) throw new Error(check.errors.join(" "));
    return { affiliateLink, cookie, clearCookie: !!input.clearCookie };
  })
  .handler(async ({ data, context }): Promise<MLConnectionView> => {
    return saveConnection(context.supabase, context.userId, data);
  });

export const buildMLAffiliateUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { productUrl: string }) => {
    const productUrl = String(input.productUrl ?? "").trim();
    if (!productUrl) throw new Error("productUrl é obrigatório.");
    return { productUrl };
  })
  .handler(async ({ data, context }) => {
    return generateAffiliateUrl(context.supabase, context.userId, data.productUrl);
  });
