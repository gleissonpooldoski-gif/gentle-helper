import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { apiClient } from "@/lib/api-client";
import { invalidateEvolutionConfigCache } from "./client.server";

export interface EvolutionSettingsDTO {
  baseUrl: string;
  updatedAt: string | null;
}

export const getEvolutionSettings = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .handler(async ({ context }): Promise<EvolutionSettingsDTO> => {
    const { supabase } = context;
    const { data } = await (supabase as any)
      .from("evolution_settings")
      .select("base_url, updated_at")
      .eq("id", "global")
      .maybeSingle();
    return {
      baseUrl: String(data?.base_url ?? ""),
      updatedAt: data?.updated_at ?? null,
    };
  });

export const saveEvolutionSettings = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { baseUrl: string }) => {
    const raw = String(data?.baseUrl ?? "").trim();
    if (!raw) throw new Error("URL é obrigatória");
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error("URL inválida");
    }
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("URL deve começar com http(s)");
    return { baseUrl: raw.replace(/\/+$/, "") };
  })
  .handler(async ({ data, context }): Promise<EvolutionSettingsDTO> => {
    const { supabase, userId } = context;
    const { data: row, error } = await (supabase as any)
      .from("evolution_settings")
      .upsert(
        {
          id: "global",
          base_url: data.baseUrl,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      )
      .select("base_url, updated_at")
      .single();
    if (error) throw new Error(error.message);
    invalidateEvolutionConfigCache();
    return {
      baseUrl: String(row.base_url ?? ""),
      updatedAt: row.updated_at ?? null,
    };
  });

export interface EvolutionTestResult {
  ok: boolean;
  status: number | null;
  message: string;
  baseUrl: string;
}

export const testEvolutionConnection = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { baseUrl?: string }) => ({
    baseUrl: data?.baseUrl ? String(data.baseUrl).trim().replace(/\/+$/, "") : "",
  }))
  .handler(async ({ data }): Promise<EvolutionTestResult> => {
    invalidateEvolutionConfigCache();
    let baseUrl = data.baseUrl;
    if (!baseUrl) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin
          .from("evolution_settings" as any)
          .select("base_url")
          .eq("id", "global")
          .maybeSingle();
        baseUrl = String((row as any)?.base_url ?? "").trim();
        if (!baseUrl) baseUrl = (process.env.EVOLUTION_API_URL || "").trim();
      } catch {
        baseUrl = (process.env.EVOLUTION_API_URL || "").trim();
      }
    }
    baseUrl = baseUrl.replace(/\/+$/, "");
    if (!baseUrl) return { ok: false, status: null, message: "URL não configurada", baseUrl: "" };
    const apiKey = process.env.EVOLUTION_API_KEY ?? "";
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch(`${baseUrl}/`, {
        headers: apiKey ? { apikey: apiKey } : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      if (res.ok) {
        return { ok: true, status: res.status, message: "Evolution API conectada", baseUrl };
      }
      if (res.status === 530 || res.status === 522 || res.status === 523 || res.status === 524) {
        return {
          ok: false,
          status: res.status,
          message: "Tunnel offline. Atualize a URL da Evolution API.",
          baseUrl,
        };
      }
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          status: res.status,
          message: "Erro de autenticação na Evolution API (apikey inválida).",
          baseUrl,
        };
      }
      if (/error code: ?1016|error code: ?1033/i.test(text)) {
        return {
          ok: false,
          status: res.status,
          message: "Tunnel offline. Atualize a URL da Evolution API.",
          baseUrl,
        };
      }
      return {
        ok: false,
        status: res.status,
        message: `API indisponível: HTTP ${res.status} ${text.slice(0, 120)}`,
        baseUrl,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/ENOTFOUND|getaddrinfo|dns/i.test(msg)) {
        return { ok: false, status: null, message: "URL inválida ou DNS não resolveu.", baseUrl };
      }
      if (/abort|ETIMEDOUT|timeout/i.test(msg)) {
        return {
          ok: false,
          status: null,
          message: "Tunnel offline. Atualize a URL da Evolution API.",
          baseUrl,
        };
      }
      return {
        ok: false,
        status: null,
        message: `Evolution API indisponível (${msg}).`,
        baseUrl,
      };
    } finally {
      clearTimeout(t);
    }
  });
