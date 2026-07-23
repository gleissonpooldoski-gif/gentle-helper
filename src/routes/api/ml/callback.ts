/**
 * Mercado Livre OAuth callback.
 * Public endpoint — ML redirects the browser here with ?code&state.
 *
 * We validate `state` (HMAC-signed, contains userId), exchange the code
 * for tokens, and store them encrypted. Then redirect back to the app.
 */
import { createFileRoute } from "@tanstack/react-router";

function redirectTo(url: string, status = 302): Response {
  return new Response(null, { status, headers: { Location: url } });
}

function appOrigin(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export const Route = createFileRoute("/api/ml/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errorParam = url.searchParams.get("error");
        const back = `${appOrigin(request)}/config-afiliados`;

        console.log("[ML][callback] recebido", {
          ok: true,
          hasCode: !!code,
          hasState: !!state,
          hasError: !!errorParam,
          hasClientId: !!process.env.ML_CLIENT_ID,
          hasClientSecret: !!process.env.ML_CLIENT_SECRET,
          hasEncKey: !!process.env.SHOPEE_CONFIG_ENC_KEY,
        });

        if (errorParam) {
          const desc = url.searchParams.get("error_description") ?? errorParam;
          return redirectTo(`${back}?ml_error=${encodeURIComponent(desc)}`);
        }
        if (!code || !state) {
          return redirectTo(`${back}?ml_error=${encodeURIComponent("Resposta inválida do Mercado Livre (code/state ausentes).")}`);
        }
        if (!process.env.ML_CLIENT_ID || !process.env.ML_CLIENT_SECRET) {
          return redirectTo(`${back}?ml_error=${encodeURIComponent("Configuração Mercado Livre incompleta: ML_CLIENT_ID/ML_CLIENT_SECRET ausentes no backend.")}`);
        }
        if (!process.env.SHOPEE_CONFIG_ENC_KEY) {
          return redirectTo(`${back}?ml_error=${encodeURIComponent("Configuração Mercado Livre incompleta: chave de criptografia (SHOPEE_CONFIG_ENC_KEY) ausente.")}`);
        }

        try {
          const { verifyState, exchangeCode, persistTokens } = await import(
            "@/modules/affiliate/mercado-livre/oauth.server"
          );
          const parsed = verifyState(state);
          if (!parsed) {
            return redirectTo(`${back}?ml_error=${encodeURIComponent("State inválido ou expirado. Tente conectar novamente.")}`);
          }
          console.log("[ML][callback] redirect_uri recuperado do state", {
            present: !!parsed.redirectUri,
            matchesCallbackPath: new URL(parsed.redirectUri).pathname === "/api/ml/callback",
          });
          const tokens = await exchangeCode(code, parsed.redirectUri);
          console.log("[ML][callback] token recebido", {
            hasAccessToken: !!tokens?.access_token,
            hasRefreshToken: !!tokens?.refresh_token,
            hasExpiresIn: !!tokens?.expires_in,
            hasUserId: tokens?.user_id != null,
          });
          await persistTokens(parsed.userId, tokens);
          return redirectTo(`${back}?ml_connected=1`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[ML][callback] erro", msg);
          return redirectTo(`${back}?ml_error=${encodeURIComponent(msg)}`);
        }
      },
    },
  },
});
