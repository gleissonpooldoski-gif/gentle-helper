/**
 * Resolução de credenciais da Evolution API por usuário (multiusuário/SaaS).
 *
 * Prioridade:
 *  1. `public.evolution_user_settings` do próprio usuário (URL + apikey criptografada)
 *  2. Configuração global (`evolution_settings.base_url` + EVOLUTION_API_KEY)
 *
 * A apikey NUNCA sai do backend: só é lida aqui para montar o header `apikey`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EvolutionClientConfig } from "./client.server";

export interface ResolvedEvolutionConfig extends EvolutionClientConfig {
  instanceName: string | null;
  source: "user" | "global";
}

export async function resolveEvolutionConfigForUser(
  supabase: SupabaseClient<any, any, any>,
  userId: string,
): Promise<ResolvedEvolutionConfig> {
  const { data: row } = await (supabase as any)
    .from("evolution_user_settings")
    .select("base_url, api_key_ciphertext, instance_name")
    .eq("user_id", userId)
    .maybeSingle();

  const baseUrl = String(row?.base_url ?? "").trim().replace(/\/+$/, "");
  const cipher = row?.api_key_ciphertext as string | null | undefined;

  if (baseUrl && cipher) {
    const { decryptSecret } = await import("@/modules/affiliate/crypto.server");
    return {
      baseUrl,
      apiKey: decryptSecret(cipher),
      instanceName: row?.instance_name ? String(row.instance_name) : null,
      source: "user",
    };
  }

  const { getEvolutionConfig } = await import("./client.server");
  const global = await getEvolutionConfig();
  return {
    ...global,
    instanceName: row?.instance_name ? String(row.instance_name) : null,
    source: "global",
  };
}
