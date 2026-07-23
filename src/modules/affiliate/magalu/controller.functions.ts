/**
 * Server-function controllers for Magalu affiliate.
 * RPC endpoints consumed by the config-afiliados UI and by campaign/product flows.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateStoreName } from "./validator";
import {
  getConnection,
  saveConnection,
  generateAffiliateUrl,
  type MagaluConnectionView,
} from "./service";

export const getMagaluConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MagaluConnectionView | null> => {
    return getConnection(context.supabase, context.userId);
  });

export const saveMagaluConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { storeName: string }) => {
    const storeName = String(input.storeName ?? "").trim();
    const check = validateStoreName(storeName);
    if (!check.ok) throw new Error(check.errors.join(" "));
    return { storeName };
  })
  .handler(async ({ data, context }): Promise<MagaluConnectionView> => {
    return saveConnection(context.supabase, context.userId, data);
  });

export const buildMagaluAffiliateUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { productUrl: string }) => {
    const productUrl = String(input.productUrl ?? "").trim();
    if (!productUrl) throw new Error("productUrl é obrigatório.");
    return { productUrl };
  })
  .handler(async ({ data, context }) => {
    return generateAffiliateUrl(context.supabase, context.userId, data.productUrl);
  });
