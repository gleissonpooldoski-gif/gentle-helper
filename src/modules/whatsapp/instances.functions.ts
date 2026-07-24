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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function toUuidOrNull(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  return UUID_RE.test(s) ? s : null;
}

const EXISTING_DIVULGA_LINKS_INSTANCE = "DIVULGA LINKS";

function isExistingDivulgaLinksInstance(instanceName: string): boolean {
  return instanceName.trim().toUpperCase() === EXISTING_DIVULGA_LINKS_INSTANCE;
}

/** Lista instâncias do usuário (opcionalmente do canal). */
export const listWhatsAppInstances = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { channelId?: string } = {}) => ({
    channelId: toUuidOrNull(data?.channelId),
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
      channelId: toUuidOrNull(data?.channelId),
    };
  })
  .handler(async ({ data, context }): Promise<WhatsAppInstanceDTO> => {
    const { supabase, userId } = context;
    const { getWhatsAppProvider } = await import("./index.server");
    const provider = getWhatsAppProvider("evolution");

    // Defesa no backend: a instância existente deve seguir exclusivamente
    // pelo fluxo de adoção/status, jamais por POST /instance/create.
    if (isExistingDivulgaLinksInstance(data.name)) {
      throw new Error('A instância "DIVULGA LINKS" já existe. Use a conexão existente.');
    }

    // Nome único remoto: user prefix + slug + short
    const slug = data.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24);
    const instanceName = `u${userId.slice(0, 8)}-${slug}-${Date.now().toString(36).slice(-4)}`;

    const insertPayload = {
      user_id: userId,
      channel_id: data.channelId,
      provider: provider.name,
      instance_name: instanceName,
      status: "creating" as const,
    };
    console.log("[WA][insert whatsapp_instances]", insertPayload);
    const { data: inserted, error: insErr } = await (supabase as any)
      .from("whatsapp_instances")
      .insert(insertPayload)
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
    } else if (!row.qr_code) {
      // Se ainda não temos QR, força reconexão para buscar um agora.
      try {
        const rc = await provider.reconnect(row.instance_name);
        patch.status = rc.status;
        patch.qr_code = rc.qr?.base64 ?? rc.qr?.code ?? null;
      } catch {
        /* ignore */
      }
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

/** Importa/registra localmente uma instância que JÁ existe na Evolution API. */
export const adoptEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { instanceName: string; channelId?: string | null }) => {
    const instanceName = String(data?.instanceName ?? "").trim();
    if (!instanceName) throw new Error("instanceName obrigatório");
    return {
      instanceName,
      channelId: toUuidOrNull(data?.channelId),
    };
  })
  .handler(async ({ data, context }): Promise<WhatsAppInstanceDTO> => {
    const { supabase, userId } = context;
    const { getWhatsAppProvider } = await import("./index.server");
    const provider = getWhatsAppProvider("evolution");
    const st = await provider.getStatus(data.instanceName);

    const { data: existing } = await (supabase as any)
      .from("whatsapp_instances")
      .select("*")
      .eq("user_id", userId)
      .eq("instance_name", data.instanceName)
      .maybeSingle();

    const payload = {
      user_id: userId,
      channel_id: data.channelId,
      provider: "evolution",
      instance_name: data.instanceName,
      status: st.status,
      phone: st.phone,
      qr_code: null,
      last_seen_at: st.status === "connected" ? new Date().toISOString() : null,
    };

    if (existing) {
      const { data: upd, error } = await (supabase as any)
        .from("whatsapp_instances")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return rowToDTO(upd);
    }
    const { data: ins, error } = await (supabase as any)
      .from("whatsapp_instances")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToDTO(ins);
  });

async function loadInstance(supabase: any, userId: string, id: string) {
  const { data: row, error } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Instância não encontrada");
  return row;
}

export interface WhatsAppGroupDTO {
  jid: string;
  name: string;
  participants: number | null;
  pictureUrl: string | null;
  selected: boolean;
}

/** Busca grupos da instância e marca os já selecionados. */
export const fetchWhatsAppGroups = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("id obrigatório");
    return { id: String(data.id) };
  })
  .handler(async ({ data, context }): Promise<WhatsAppGroupDTO[]> => {
    const { supabase, userId } = context;
    const row = await loadInstance(supabase, userId, data.id);
    const { getWhatsAppProvider } = await import("./index.server");
    const groups = await getWhatsAppProvider(row.provider).fetchGroups(row.instance_name);

    const { data: sel } = await (supabase as any)
      .from("whatsapp_group_selections")
      .select("group_jid")
      .eq("user_id", userId)
      .eq("instance_id", row.id);
    const selectedSet = new Set<string>((sel ?? []).map((s: any) => s.group_jid));

    return groups.map((g) => ({ ...g, selected: selectedSet.has(g.jid) }));
  });

/** Salva a lista de grupos selecionados (substitui). */
export const saveWhatsAppGroupSelection = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: {
    id: string;
    groups: Array<{ jid: string; name?: string }>;
  }) => {
    if (!data?.id) throw new Error("id obrigatório");
    if (!Array.isArray(data.groups)) throw new Error("groups obrigatório");
    return {
      id: String(data.id),
      groups: data.groups.map((g) => ({
        jid: String(g.jid),
        name: g.name ? String(g.name) : null,
      })),
    };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; count: number }> => {
    const { supabase, userId } = context;
    const row = await loadInstance(supabase, userId, data.id);

    await (supabase as any)
      .from("whatsapp_group_selections")
      .delete()
      .eq("user_id", userId)
      .eq("instance_id", row.id);

    if (data.groups.length > 0) {
      const rows = data.groups.map((g) => ({
        user_id: userId,
        instance_id: row.id,
        channel_id: row.channel_id,
        group_jid: g.jid,
        group_name: g.name,
      }));
      const { error } = await (supabase as any)
        .from("whatsapp_group_selections")
        .insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true, count: data.groups.length };
  });

/** Envia texto para um JID (grupo ou número). */
export const sendWhatsAppText = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { id: string; jid: string; text: string }) => {
    if (!data?.id) throw new Error("id obrigatório");
    const jid = String(data?.jid ?? "").trim();
    const text = String(data?.text ?? "").trim();
    if (!jid) throw new Error("Destinatário obrigatório");
    if (!text) throw new Error("Mensagem vazia");
    if (text.length > 4000) throw new Error("Mensagem muito longa");
    return { id: String(data.id), jid, text };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; messageId?: string }> => {
    const { supabase, userId } = context;
    const row = await loadInstance(supabase, userId, data.id);
    if (row.status !== "connected") throw new Error("Instância não conectada");
    const { getWhatsAppProvider } = await import("./index.server");
    const res = await getWhatsAppProvider(row.provider).sendText(
      row.instance_name,
      data.jid,
      data.text,
    );
    return { ok: true, messageId: res.id };
  });

/** Envia mensagem formatada de produto/oferta para um grupo (ou lista de grupos). */
export const sendWhatsAppProduct = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: {
    id: string;
    jids?: string[];        // se ausente, usa grupos selecionados
    product: { name: string; price?: string | number | null; link: string; image?: string | null };
  }) => {
    if (!data?.id) throw new Error("id obrigatório");
    const name = String(data?.product?.name ?? "").trim();
    const link = String(data?.product?.link ?? "").trim();
    if (!name) throw new Error("Nome do produto obrigatório");
    if (!link) throw new Error("Link do produto obrigatório");
    return {
      id: String(data.id),
      jids: Array.isArray(data.jids) ? data.jids.map((j) => String(j)) : null,
      product: {
        name,
        price: data.product.price != null ? String(data.product.price) : null,
        link,
        image: data.product.image ? String(data.product.image) : null,
      },
    };
  })
  .handler(async ({ data, context }): Promise<{ sent: number; failed: number }> => {
    const { supabase, userId } = context;
    const row = await loadInstance(supabase, userId, data.id);
    if (row.status !== "connected") throw new Error("Instância não conectada");

    let targets = data.jids ?? [];
    if (targets.length === 0) {
      const { data: sel } = await (supabase as any)
        .from("whatsapp_group_selections")
        .select("group_jid")
        .eq("user_id", userId)
        .eq("instance_id", row.id);
      targets = (sel ?? []).map((s: any) => s.group_jid);
    }
    if (targets.length === 0) throw new Error("Nenhum grupo selecionado");

    const p = data.product;
    const priceLine = p.price ? `\n💰 Preço:\n${p.price}\n` : "\n";
    const text =
      `🔥 OFERTA ENCONTRADA\n\n` +
      `Produto:\n${p.name}\n` +
      priceLine +
      `\n🛒 Comprar:\n${p.link}`;

    const { getWhatsAppProvider } = await import("./index.server");
    const provider = getWhatsAppProvider(row.provider);

    let sent = 0;
    let failed = 0;
    for (const jid of targets) {
      try {
        await provider.sendText(row.instance_name, jid, text);
        sent++;
        await new Promise((r) => setTimeout(r, 800));
      } catch {
        failed++;
      }
    }
    return { sent, failed };
  });

/** Dispara mensagem para todos os grupos selecionados. */
export const sendWhatsAppCampaign = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { id: string; text: string }) => {
    if (!data?.id) throw new Error("id obrigatório");
    const text = String(data?.text ?? "").trim();
    if (!text) throw new Error("Mensagem vazia");
    return { id: String(data.id), text };
  })
  .handler(async ({ data, context }): Promise<{
    sent: number;
    failed: number;
    errors: Array<{ jid: string; error: string }>;
  }> => {
    const { supabase, userId } = context;
    const row = await loadInstance(supabase, userId, data.id);
    if (row.status !== "connected") throw new Error("Instância não conectada");

    const { data: sel } = await (supabase as any)
      .from("whatsapp_group_selections")
      .select("group_jid")
      .eq("user_id", userId)
      .eq("instance_id", row.id);
    const targets: string[] = (sel ?? []).map((s: any) => s.group_jid);
    if (targets.length === 0) throw new Error("Nenhum grupo selecionado");

    const { getWhatsAppProvider } = await import("./index.server");
    const provider = getWhatsAppProvider(row.provider);

    let sent = 0;
    let failed = 0;
    const errors: Array<{ jid: string; error: string }> = [];
    for (const jid of targets) {
      try {
        await provider.sendText(row.instance_name, jid, data.text);
        sent++;
        // Pequeno delay entre envios (anti-flood)
        await new Promise((r) => setTimeout(r, 800));
      } catch (err) {
        failed++;
        errors.push({ jid, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { sent, failed, errors };
  });
