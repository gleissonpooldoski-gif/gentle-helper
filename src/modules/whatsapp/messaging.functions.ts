import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { apiClient } from "@/lib/api-client";

export interface WhatsAppMessageRow {
  id: string;
  instanceName: string;
  phone: string;
  message: string | null;
  direction: "inbound" | "outbound";
  status: string;
  error: string | null;
  createdAt: string;
}

/**
 * Envia uma mensagem de texto avulsa (transacional / teste) para um número.
 * Grupos NÃO passam por aqui: broadcast de ofertas continua exclusivamente
 * no fluxo de CLAIM atômico da automação.
 */
export const sendWhatsAppMessage = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { number: string; message: string; instanceName?: string }) => {
    const number = String(data?.number ?? "").replace(/\D/g, "");
    const message = String(data?.message ?? "").trim();
    if (!number) throw new Error("Número de destino é obrigatório");
    if (number.length < 10 || number.length > 15) throw new Error("Número inválido (use DDI+DDD+número)");
    if (!message) throw new Error("Mensagem vazia");
    if (message.length > 4000) throw new Error("Mensagem muito longa (máx. 4000)");
    return { number, message, instanceName: String(data?.instanceName ?? "").trim() };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; messageId: string | null; error: string | null }> => {
    const { supabase, userId } = context;
    const { resolveEvolutionConfigForUser } = await import("./evolution/user-config.server");
    const { sendTextViaEvolution } = await import("./evolution/panel.server");

    const cfg = await resolveEvolutionConfigForUser(supabase as any, userId);
    const instanceName = data.instanceName || cfg.instanceName;
    if (!instanceName) throw new Error("Defina a instância nas configurações do WhatsApp");

    const result = await sendTextViaEvolution(cfg, instanceName, data.number, data.message);

    await (supabase as any).from("whatsapp_messages").insert({
      user_id: userId,
      instance_name: instanceName,
      phone: data.number,
      message: data.message,
      direction: "outbound",
      status: result.ok ? "sent" : "failed",
      message_id: result.messageId,
      error: result.error,
    });

    return result;
  });

/** Histórico de mensagens do usuário (entrada e saída). */
export const listWhatsAppMessages = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { limit?: number } = {}) => ({
    limit: Math.min(Math.max(Number(data?.limit ?? 50) || 50, 1), 200),
  }))
  .handler(async ({ data, context }): Promise<WhatsAppMessageRow[]> => {
    const { supabase, userId } = context;
    const { data: rows, error } = await (supabase as any)
      .from("whatsapp_messages")
      .select("id,instance_name,phone,message,direction,status,error,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      instanceName: r.instance_name,
      phone: r.phone,
      message: r.message,
      direction: r.direction,
      status: r.status,
      error: r.error,
      createdAt: r.created_at,
    }));
  });
