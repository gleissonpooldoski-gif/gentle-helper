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

    // Regra: SEMPRE consultar /instance/connectionState primeiro. Se state=open,
    // apenas marcar como conectado e NÃO chamar /instance/connect nem abrir QR.
    const st = await provider.getStatus(row.instance_name);
    // eslint-disable-next-line no-console
    console.log(`[WA] connectionState recebido: ${st.status} (instance=${row.instance_name})`);

    const patch: any = { status: st.status };
    if (st.phone) patch.phone = st.phone;
    if (st.status === "connected") {
      patch.qr_code = null;
      patch.last_seen_at = new Date().toISOString();
    }
    // Nunca solicitar QR automaticamente aqui. QR só via reconnectWhatsAppInstance,
    // acionado explicitamente pelo usuário quando state != open.

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
    console.log("[WA][adopt whatsapp_instances]", payload);


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
  .inputValidator((data: { id: string; channelId: string }) => {
    if (!data?.id) throw new Error("id obrigatório");
    const channelId = toUuidOrNull(data?.channelId);
    if (!channelId) throw new Error("channelId inválido");
    return { id: String(data.id), channelId };
  })
  .handler(async ({ data, context }): Promise<WhatsAppGroupDTO[]> => {
    const { supabase, userId } = context;
    const row = await loadInstance(supabase, userId, data.id);

    // Somente grupos autorizados pelo usuário na etapa de configuração
    // (monitored_groups para este canal). A Evolution é usada apenas para
    // enriquecer nome/participantes/foto — nunca para definir destinos.
    const { data: allowed } = await (supabase as any)
      .from("monitored_groups")
      .select("group_jid, group_name")
      .eq("user_id", userId)
      .eq("channel_id", data.channelId)
      .eq("is_active", true);

    const allowedList: Array<{ group_jid: string; group_name: string | null }> =
      allowed ?? [];
    if (allowedList.length === 0) return [];
    const allowedJids = new Set(allowedList.map((a) => a.group_jid));

    let evoMap = new Map<
      string,
      { name: string; participants: number | null; pictureUrl: string | null }
    >();
    try {
      const { getWhatsAppProvider } = await import("./index.server");
      const groups = await getWhatsAppProvider(row.provider).fetchGroups(
        row.instance_name,
      );
      for (const g of groups) {
        if (g?.jid && allowedJids.has(g.jid)) {
          evoMap.set(g.jid, {
            name: g.name,
            participants: g.participants ?? null,
            pictureUrl: g.pictureUrl ?? null,
          });
        }
      }
    } catch {
      /* segue com dados salvos se Evolution falhar */
    }

    const { data: sel } = await (supabase as any)
      .from("whatsapp_group_selections")
      .select("group_jid")
      .eq("user_id", userId)
      .eq("instance_id", row.id)
      .eq("channel_id", data.channelId);
    const selectedSet = new Set<string>((sel ?? []).map((s: any) => s.group_jid));

    return allowedList.map((a) => {
      const evo = evoMap.get(a.group_jid);
      return {
        jid: a.group_jid,
        name: evo?.name || a.group_name || "(grupo sem nome)",
        participants: evo?.participants ?? null,
        pictureUrl: evo?.pictureUrl ?? null,
        selected: selectedSet.has(a.group_jid) || selectedSet.size === 0,
      };
    });
  });


/** Salva a lista de grupos selecionados (substitui). */
export const saveWhatsAppGroupSelection = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: {
    id: string;
    channelId: string;
    groups: Array<{ jid: string; name?: string }>;
  }) => {
    if (!data?.id) throw new Error("id obrigatório");
    const channelId = toUuidOrNull(data?.channelId);
    if (!channelId) throw new Error("channelId inválido");
    if (!Array.isArray(data.groups)) throw new Error("groups obrigatório");
    return {
      id: String(data.id),
      channelId,
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
      .eq("instance_id", row.id)
      .eq("channel_id", data.channelId);

    if (data.groups.length > 0) {
      const rows = data.groups.map((g) => ({
        user_id: userId,
        instance_id: row.id,
        channel_id: data.channelId,
        group_jid: g.jid,
        group_name: g.name,
      }));
      console.log("[WA][insert whatsapp_group_selections]", { count: rows.length, sample: rows[0] });
      const { error } = await (supabase as any)
        .from("whatsapp_group_selections")
        .upsert(rows, { onConflict: "user_id,channel_id,group_jid" });
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

/**
 * Envia mensagem de produto/oferta usando EXATAMENTE o mesmo conteúdo
 * gerado pelo Post/Layout do SaaS (Instagram/Facebook/YouTube/WhatsApp
 * compartilham o mesmo template). Envia como mídia via
 * `POST /message/sendMedia/{instance}` — imagem obrigatória.
 */
export const sendWhatsAppProduct = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: {
    id: string;
    channelId: string;
    jids?: string[];        // se ausente, usa grupos selecionados
    productId?: string;     // opcional — carrega do banco quando fornecido
    product?: {
      title?: string;
      name?: string;
      description?: string | null;
      price?: string | number | null;
      price_original?: string | number | null;
      parcelamento?: string | null;
      vendas?: number | string | null;
      link: string;
      image?: string | null;
    };
  }) => {
    if (!data?.id) throw new Error("id obrigatório");
    const channelId = toUuidOrNull(data.channelId);
    if (!channelId) throw new Error("channelId inválido");
    const jids = Array.isArray(data.jids) ? data.jids.map((j) => String(j)) : null;
    if (data.productId) return { id: String(data.id), channelId, jids, productId: String(data.productId), product: null };
    const p = data.product;
    if (!p) throw new Error("Informe productId ou product");
    const title = String(p.title ?? p.name ?? "").trim();
    const link = String(p.link ?? "").trim();
    if (!title) throw new Error("Nome do produto obrigatório");
    if (!link) throw new Error("Link do produto obrigatório");
    return {
      id: String(data.id),
      channelId,
      jids,
      productId: null,
      product: {
        title,
        description: p.description ?? null,
        price: p.price ?? null,
        price_original: p.price_original ?? null,
        parcelamento: p.parcelamento ?? null,
        vendas: p.vendas ?? null,
        link,
        image: p.image ?? null,
      },
    };
  })
  .handler(async ({ data, context }): Promise<{
    sent: number;
    failed: number;
    errors: Array<{ jid: string; error: string }>;
  }> => {
    const { supabase, userId } = context;
    const row = await loadInstance(supabase, userId, data.id);

    const { getWhatsAppProvider } = await import("./index.server");
    const provider = getWhatsAppProvider(row.provider);

    // Antes de enviar: validar state=open na Evolution.
    const live = await provider.getStatus(row.instance_name);
    if (live.status !== "connected") {
      throw new Error("Instância não conectada (state != open)");
    }

    // Carrega produto do banco quando productId foi enviado.
    let product = data.product as any;
    let productId: string | null = data.productId ?? null;
    if (!product && productId) {
      const { data: prod, error } = await (supabase as any)
        .from("products")
        .select("*")
        .eq("user_id", userId)
        .eq("channel_id", data.channelId)
        .eq("id", productId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!prod) throw new Error("Produto não encontrado");
      product = {
        title: prod.title,
        description: null,
        price: prod.promo_price,
        price_original: prod.original_price,
        parcelamento: null,
        vendas: prod.sales,
        link: prod.affiliate_link,
        image: prod.image_url,
      };
    }
    if (!product) throw new Error("Produto ausente");
    if (!product.image) {
      throw new Error("Produto sem imagem. Rode o enriquecimento de imagens antes de enviar.");
    }

    // Renderiza usando o MESMO layout persistido no SaaS.
    const { loadLayoutFor } = await import("@/modules/posts/layout.functions");
    const { renderPost } = await import("@/modules/posts/render");
    const layout = await loadLayoutFor(supabase, userId, (row as any).channel_id ?? null);
    const caption = renderPost(layout, product, "whatsapp");

    // Destinos: JIDs informados ou seleção salva.
    let targets = data.jids ?? [];
    if (targets.length === 0) {
      const { data: sel } = await (supabase as any)
        .from("whatsapp_group_selections")
        .select("group_jid")
        .eq("user_id", userId)
        .eq("instance_id", row.id)
        .eq("channel_id", data.channelId);
      targets = (sel ?? []).map((s: any) => s.group_jid);
    }
    if (targets.length === 0) throw new Error("Nenhum grupo selecionado");

    let sent = 0;
    let failed = 0;
    const errors: Array<{ jid: string; error: string }> = [];

    for (const jid of targets) {
      let messageId: string | undefined;
      let status: "sent" | "failed" = "sent";
      let errorMsg: string | null = null;
      try {
        const res = await provider.sendMedia(row.instance_name, jid, {
          mediaUrl: product.image,
          caption,
        });
        messageId = res.id;
        sent++;
        await new Promise((r) => setTimeout(r, 800));
      } catch (err) {
        status = "failed";
        failed++;
        errorMsg = err instanceof Error ? err.message : String(err);
        errors.push({ jid, error: errorMsg });
      }

      // Histórico do envio
      try {
        await (supabase as any).from("whatsapp_send_history").insert({
          user_id: userId,
          instance_id: row.id,
          product_id: productId,
          jid,
          caption,
          media_url: product.image,
          status,
          error: errorMsg,
          message_id: messageId ?? null,
        });
      } catch (histErr) {
        console.warn("[WA] history insert failed:", histErr);
      }
    }
    return { sent, failed, errors };
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
