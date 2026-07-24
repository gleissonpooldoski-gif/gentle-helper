import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { apiClient } from "@/lib/api-client";
import { getRequestHost } from "@tanstack/react-start/server";
import type { WhatsAppInstanceStatus } from "./provider";

export interface WhatsAppInstanceDTO {
  id: string;
  channelId: string | null;
  provider: string;
  instanceName: string;
  phone: string | null;
  status: WhatsAppInstanceStatus;
  qrCode: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToDTO(r: any): WhatsAppInstanceDTO {
  return {
    id: r.id,
    channelId: r.channel_id,
    provider: r.provider,
    instanceName: r.instance_name,
    phone: r.phone,
    status: r.status as WhatsAppInstanceStatus,
    qrCode: r.qr_code,
    lastSeenAt: r.last_seen_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function computeWebhookUrl(): string | undefined {
  try {
    const host = getRequestHost({ xForwardedHost: true });
    if (!host) return undefined;
    const proto = host.includes("localhost") ? "http" : "https";
    return `${proto}://${host}/api/public/whatsapp/webhook`;
  } catch {
    return undefined;
  }
}

/** Lista instâncias do usuário (opcionalmente do canal). */
export const listWhatsAppInstances = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { channelId?: string } = {}) => ({
    channelId: data?.channelId ? String(data.channelId) : null,
  }))
  .handler(async ({ data, context }): Promise<WhatsAppInstanceDTO[]> => {
    const { supabase, userId } = context;
    let q = (supabase as any)
      .from("whatsapp_instances")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (data.channelId) q = q.eq("channel_id", data.channelId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map(rowToDTO);
  });

/** Cria nova instância e solicita QR. */
export const createWhatsAppInstance = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { name: string; channelId?: string | null }) => {
    const name = String(data?.name ?? "").trim();
    if (!name) throw new Error("Nome da sessão é obrigatório");
    if (name.length > 60) throw new Error("Nome muito longo (máx. 60)");
    if (!/^[a-zA-Z0-9_\- ]+$/.test(name)) {
      throw new Error("Use apenas letras, números, espaço, _ ou -");
    }
    return {
      name,
      channelId: data?.channelId ? String(data.channelId) : null,
    };
  })
  .handler(async ({ data, context }): Promise<WhatsAppInstanceDTO> => {
    const { supabase, userId } = context;
    const { getWhatsAppProvider } = await import("./index.server");
    const provider = getWhatsAppProvider("evolution");

    // Nome único remoto: user prefix + slug + short
    const slug = data.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24);
    const instanceName = `u${userId.slice(0, 8)}-${slug}-${Date.now().toString(36).slice(-4)}`;

    const { data: inserted, error: insErr } = await (supabase as any)
      .from("whatsapp_instances")
      .insert({
        user_id: userId,
        channel_id: data.channelId,
        provider: provider.name,
        instance_name: instanceName,
        status: "creating",
      })
      .select("*")
      .single();
    if (insErr) throw new Error(insErr.message);

    try {
      const webhookUrl = computeWebhookUrl();
      const st = await provider.createInstance({ instanceName, webhookUrl });
      const { data: updated, error: updErr } = await (supabase as any)
        .from("whatsapp_instances")
        .update({
          status: st.status,
          qr_code: st.qr?.base64 ?? st.qr?.code ?? null,
          phone: st.phone,
        })
        .eq("id", inserted.id)
        .select("*")
        .single();
      if (updErr) throw new Error(updErr.message);
      return rowToDTO(updated);
    } catch (err) {
      await (supabase as any)
        .from("whatsapp_instances")
        .update({ status: "error", qr_code: null })
        .eq("id", inserted.id);
      throw err;
    }
  });

/** Consulta status ao vivo + atualiza a linha. */
export const refreshWhatsAppInstance = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("id obrigatório");
    return { id: String(data.id) };
  })
  .handler(async ({ data, context }): Promise<WhatsAppInstanceDTO> => {
    const { supabase, userId } = context;
    const { data: row, error } = await (supabase as any)
      .from("whatsapp_instances")
      .select("*")
      .eq("user_id", userId)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Instância não encontrada");

    const { getWhatsAppProvider } = await import("./index.server");
    const provider = getWhatsAppProvider(row.provider);
    const st = await provider.getStatus(row.instance_name);

    const patch: any = { status: st.status };
    if (st.phone) patch.phone = st.phone;
    if (st.status === "connected") {
      patch.qr_code = null;
      patch.last_seen_at = new Date().toISOString();
    }
    const { data: updated, error: upErr } = await (supabase as any)
      .from("whatsapp_instances")
      .update(patch)
      .eq("id", row.id)
      .select("*")
      .single();
    if (upErr) throw new Error(upErr.message);
    return rowToDTO(updated);
  });

/** Solicita novo QR / reconecta. */
export const reconnectWhatsAppInstance = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("id obrigatório");
    return { id: String(data.id) };
  })
  .handler(async ({ data, context }): Promise<WhatsAppInstanceDTO> => {
    const { supabase, userId } = context;
    const { data: row, error } = await (supabase as any)
      .from("whatsapp_instances")
      .select("*")
      .eq("user_id", userId)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Instância não encontrada");

    const { getWhatsAppProvider } = await import("./index.server");
    const provider = getWhatsAppProvider(row.provider);
    const st = await provider.reconnect(row.instance_name);

    const { data: updated, error: upErr } = await (supabase as any)
      .from("whatsapp_instances")
      .update({
        status: st.status,
        qr_code: st.qr?.base64 ?? st.qr?.code ?? null,
        phone: st.phone ?? row.phone,
      })
      .eq("id", row.id)
      .select("*")
      .single();
    if (upErr) throw new Error(upErr.message);
    return rowToDTO(updated);
  });

/** Desconecta (logout) sem apagar. */
export const disconnectWhatsAppInstance = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("id obrigatório");
    return { id: String(data.id) };
  })
  .handler(async ({ data, context }): Promise<WhatsAppInstanceDTO> => {
    const { supabase, userId } = context;
    const { data: row, error } = await (supabase as any)
      .from("whatsapp_instances")
      .select("*")
      .eq("user_id", userId)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Instância não encontrada");

    const { getWhatsAppProvider } = await import("./index.server");
    const provider = getWhatsAppProvider(row.provider);
    try {
      await provider.disconnect(row.instance_name);
    } catch (err) {
      console.warn("[WA] disconnect provider error:", err);
    }
    const { data: updated, error: upErr } = await (supabase as any)
      .from("whatsapp_instances")
      .update({ status: "disconnected", qr_code: null })
      .eq("id", row.id)
      .select("*")
      .single();
    if (upErr) throw new Error(upErr.message);
    return rowToDTO(updated);
  });

/** Apaga a instância remota e local. */
export const deleteWhatsAppInstance = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("id obrigatório");
    return { id: String(data.id) };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const { data: row } = await (supabase as any)
      .from("whatsapp_instances")
      .select("*")
      .eq("user_id", userId)
      .eq("id", data.id)
      .maybeSingle();
    if (row) {
      try {
        const { getWhatsAppProvider } = await import("./index.server");
        await getWhatsAppProvider(row.provider).deleteInstance(row.instance_name);
      } catch (err) {
        console.warn("[WA] delete provider error:", err);
      }
      await (supabase as any)
        .from("whatsapp_instances")
        .delete()
        .eq("id", row.id);
    }
    return { ok: true };
  });
