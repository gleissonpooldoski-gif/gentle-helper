/**
 * Server-fn entry points for the Mercado Livre OAuth integration.
 * The actual work lives in oauth.server.ts (server-only).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const startMLOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ redirectUri: z.string().url() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { buildAuthorizeUrl, signState } = await import("./oauth.server");
    const state = signState(context.userId);
    return { authorizationUrl: buildAuthorizeUrl(data.redirectUri, state) };
  });

export const getMLIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readIntegrationView } = await import("./oauth.server");
    return readIntegrationView(context.userId);
  });

export const disconnectMLIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { deleteIntegration } = await import("./oauth.server");
    await deleteIntegration(context.userId);
    return { ok: true };
  });
