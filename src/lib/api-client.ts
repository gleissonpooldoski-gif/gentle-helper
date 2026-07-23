import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

const EXPIRY_SAFETY_WINDOW_SECONDS = 30;

function redirectToLogin() {
  if (typeof window === "undefined" || window.location.pathname === "/auth") return;
  const redirect = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/auth?redirect=${encodeURIComponent(redirect)}`);
}

function isAuthenticationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("Unauthorized") || message.includes("authorization header");
}

/**
 * Global authenticated RPC client.
 *
 * It restores/refreshes the persisted login session before every authenticated
 * server-function request and sends the access token through the standard
 * Authorization: Bearer header. The backend remains responsible for validating
 * the token and deriving user_id from it.
 */
export const apiClient = createMiddleware({ type: "function" }).client(async ({ next }) => {
  if (typeof window === "undefined") return next();

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    redirectToLogin();
    throw new Error("Sua sessão expirou. Entre novamente para continuar.");
  }

  let session = data.session;
  const expiresSoon =
    session?.expires_at != null &&
    session.expires_at <= Math.floor(Date.now() / 1000) + EXPIRY_SAFETY_WINDOW_SECONDS;

  if (session && expiresSoon) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error) {
      redirectToLogin();
      throw new Error("Sua sessão expirou. Entre novamente para continuar.");
    }
    session = refreshed.data.session;
  }

  const token = session?.access_token;
  if (!token) {
    redirectToLogin();
    throw new Error("Faça login para salvar suas configurações.");
  }

  try {
    return await next({ headers: { Authorization: `Bearer ${token}` } });
  } catch (error) {
    if (isAuthenticationError(error)) redirectToLogin();
    throw error;
  }
});