import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

const EXPIRY_SAFETY_WINDOW_SECONDS = 30;

/**
 * Global authenticated RPC client.
 *
 * Attaches the current Supabase access token to every server-function request.
 * Intencionalmente NÃO redireciona para /auth em caso de falha — isso causava
 * hard-reloads no meio de interações (digitar nome de instância, polling de
 * QR, realtime) e derrubava o usuário do fluxo. A proteção real de rotas
 * autenticadas é feita pelo layout `_authenticated`; aqui apenas propagamos o
 * erro para o chamador tratar com toast.
 */
export const apiClient = createMiddleware({ type: "function" }).client(async ({ next }) => {
  if (typeof window === "undefined") return next();

  let session = null as Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"];
  try {
    const { data } = await supabase.auth.getSession();
    session = data.session;
  } catch {
    // Falha transitória lendo sessão — segue sem token; backend responde 401
    // e o chamador exibe toast. Não redireciona.
  }

  const expiresSoon =
    session?.expires_at != null &&
    session.expires_at <= Math.floor(Date.now() / 1000) + EXPIRY_SAFETY_WINDOW_SECONDS;

  if (session && expiresSoon) {
    try {
      const refreshed = await supabase.auth.refreshSession();
      if (!refreshed.error && refreshed.data.session) {
        session = refreshed.data.session;
      }
    } catch {
      /* segue com token atual; se estiver realmente expirado, backend devolve 401 */
    }
  }

  const token = session?.access_token;
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});
