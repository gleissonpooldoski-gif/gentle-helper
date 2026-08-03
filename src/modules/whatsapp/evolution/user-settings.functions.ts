import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { apiClient } from "@/lib/api-client";

export interface EvolutionUserSettingsDTO {
  baseUrl: string;
  instanceName: string;
  hasApiKey: boolean;
  source: "user" | "global";
  updatedAt: string | null;
}

export interface EvolutionInstanceSummary {
  name: string;
  state: string;
  phone: string | null;
  profileName: string | null;
}

export interface EvolutionConnectionState {
  configured: boolean;
  instanceName: string | null;
  status: "connected" | "awaiting_qr" | "disconnected" | "unknown";
  phone: string | null;
  lastActivity: string | null;
  message: string;
  instances: EvolutionInstanceSummary[];
}

/** Configurações da Evolution do usuário logado (nunca devolve a apikey). */
export const getEvolutionUserSettings = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .handler(async ({ context }): Promise<EvolutionUserSettingsDTO> => {
    const { supabase, userId } = context;
    const { data: row } = await (supabase as any)
      .from("evolution_user_settings")
      .select("base_url, api_key_ciphertext, instance_name, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    let baseUrl = String(row?.base_url ?? "").trim();
    const hasApiKey = Boolean(row?.api_key_ciphertext);
    let source: "user" | "global" = baseUrl && hasApiKey ? "user" : "global";

    if (source === "global") {
      const { data: g } = await (supabase as any)
        .from("evolution_settings")
        .select("base_url")
        .eq("id", "global")
        .maybeSingle();
      if (!baseUrl) baseUrl = String(g?.base_url ?? "");
    }

    return {
      baseUrl,
      instanceName: String(row?.instance_name ?? ""),
      hasApiKey,
      source,
      updatedAt: row?.updated_at ?? null,
    };
  });

/** Salva URL, apikey (criptografada) e instância padrão do usuário. */
export const saveEvolutionUserSettings = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { baseUrl: string; apiKey?: string; instanceName?: string }) => {
    const baseUrl = String(data?.baseUrl ?? "").trim().replace(/\/+$/, "");
    if (!baseUrl) throw new Error("URL da Evolution API é obrigatória");
    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new Error("URL inválida");
    }
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("A URL deve começar com http(s)");
    const apiKey = typeof data?.apiKey === "string" ? data.apiKey.trim() : "";
    if (apiKey.length > 512) throw new Error("API Key muito longa");
    const instanceName = String(data?.instanceName ?? "").trim().slice(0, 80);
    return { baseUrl, apiKey, instanceName };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const patch: Record<string, unknown> = {
      user_id: userId,
      base_url: data.baseUrl,
      instance_name: data.instanceName || null,
      updated_at: new Date().toISOString(),
    };
    if (data.apiKey) {
      const { encryptSecret } = await import("@/modules/affiliate/crypto.server");
      patch.api_key_ciphertext = encryptSecret(data.apiKey);
    }
    const { error } = await (supabase as any)
      .from("evolution_user_settings")
      .upsert(patch, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Estado atual da conexão + instâncias visíveis na Evolution do usuário. */
export const getEvolutionConnectionState = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .handler(async ({ context }): Promise<EvolutionConnectionState> => {
    const { supabase, userId } = context;
    const { resolveEvolutionConfigForUser } = await import("./user-config.server");
    const { readEvolutionConnectionState } = await import("./panel.server");
    try {
      const cfg = await resolveEvolutionConfigForUser(supabase as any, userId);
      return await readEvolutionConnectionState(cfg);
    } catch (err) {
      return {
        configured: false,
        instanceName: null,
        status: "unknown",
        phone: null,
        lastActivity: null,
        message: (err as Error).message,
        instances: [],
      };
    }
  });

/** Cria a instância na Evolution (POST /instance/create). */
export const createEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { instanceName: string }) => {
    const instanceName = String(data?.instanceName ?? "").trim();
    if (!instanceName) throw new Error("Nome da instância é obrigatório");
    if (!/^[\w .-]{1,80}$/.test(instanceName)) throw new Error("Nome de instância inválido");
    return { instanceName };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; qrCode: string | null }> => {
    const { supabase, userId } = context;
    const { resolveEvolutionConfigForUser } = await import("./user-config.server");
    const { createRemoteInstance } = await import("./panel.server");
    const cfg = await resolveEvolutionConfigForUser(supabase as any, userId);
    const qrCode = await createRemoteInstance(cfg, data.instanceName);
    await (supabase as any)
      .from("evolution_user_settings")
      .upsert(
        { user_id: userId, base_url: cfg.baseUrl, instance_name: data.instanceName, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    return { ok: true, qrCode };
  });

/** Gera/atualiza o QR Code (GET /instance/connect/{instance}). */
export const connectEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { instanceName?: string } = {}) => ({
    instanceName: String(data?.instanceName ?? "").trim(),
  }))
  .handler(async ({ data, context }): Promise<{ qrCode: string | null; pairingCode: string | null; status: string }> => {
    const { supabase, userId } = context;
    const { resolveEvolutionConfigForUser } = await import("./user-config.server");
    const { connectRemoteInstance } = await import("./panel.server");
    const cfg = await resolveEvolutionConfigForUser(supabase as any, userId);
    const instanceName = data.instanceName || cfg.instanceName;
    if (!instanceName) throw new Error("Defina o nome da instância nas configurações");
    return connectRemoteInstance(cfg, instanceName);
  });

/** Desconecta o WhatsApp da instância (DELETE /instance/logout/{instance}). */
export const disconnectEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { instanceName?: string } = {}) => ({
    instanceName: String(data?.instanceName ?? "").trim(),
  }))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { supabase, userId } = context;
    const { resolveEvolutionConfigForUser } = await import("./user-config.server");
    const { logoutRemoteInstance } = await import("./panel.server");
    const cfg = await resolveEvolutionConfigForUser(supabase as any, userId);
    const instanceName = data.instanceName || cfg.instanceName;
    if (!instanceName) throw new Error("Defina o nome da instância nas configurações");
    return logoutRemoteInstance(cfg, instanceName);
  });
