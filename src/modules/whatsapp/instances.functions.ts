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

/** Lista TODAS as instâncias do usuário (compartilhadas entre todos os modais). */
export const listWhatsAppInstances = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { channelId?: string } = {}) => ({
    channelId: toUuidOrNull(data?.channelId),
  }))
  .handler(async ({ data: _data, context }): Promise<WhatsAppInstanceDTO[]> => {
    const { supabase, userId } = context;
    // Todas as instâncias conectadas na conta devem aparecer em qualquer modal
    // de grupo/canal — a seleção de grupos permanece isolada por channel_id
    // + instance_id em whatsapp_group_selections.
    const { data: rows, error } = await (supabase as any)
      .from("whatsapp_instances")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
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
    let st: Awaited<ReturnType<typeof provider.getStatus>>;
    try {
      st = await provider.getStatus(row.instance_name);
    } catch (err) {
      // Erros transitórios da Evolution (502/503/504/timeout/tunnel) NÃO devem
      // marcar a instância como desconectada. Preserva último estado no banco
      // e devolve o DTO atual para não derrubar a UI.
      // eslint-disable-next-line no-console
      console.warn(
        `[WA] getStatus falhou (instance=${row.instance_name}) — preservando estado do banco:`,
        (err as Error)?.message ?? err,
      );
      return rowToDTO(row);
    }
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

    const { data: existing } = await (supabase as any)
      .from("whatsapp_instances")
      .select("*")
      .eq("user_id", userId)
      .eq("instance_name", data.instanceName)
      .maybeSingle();

    // Consulta status ao vivo — mas trata falha/instabilidade do provider como
    // "sem novidade": não rebaixamos uma instância já conectada só porque a
    // Evolution respondeu lento/erro em um refresh de modal.
    let liveStatus: string | null = null;
    let livePhone: string | null = null;
    try {
      const st = await provider.getStatus(data.instanceName);
      liveStatus = st.status;
      livePhone = st.phone ?? null;
    } catch (err) {
      console.warn("[WA][adopt] getStatus falhou, preservando status do banco:", err);
    }

    const dbStatus: string | null = existing?.status ?? null;
    // Regra: só rebaixa "connected" para outro status se o provider disser
    // explicitamente "disconnected". "connecting" / erros transitórios mantêm
    // o status atual do banco.
    const effectiveStatus =
      liveStatus === "connected"
        ? "connected"
        : liveStatus === "disconnected"
          ? "disconnected"
          : (dbStatus ?? liveStatus ?? "disconnected");

    const payload = {
      user_id: userId,
      channel_id: data.channelId,
      provider: "evolution",
      instance_name: data.instanceName,
      status: effectiveStatus,
      phone: livePhone ?? existing?.phone ?? null,
      qr_code: effectiveStatus === "connected" ? null : existing?.qr_code ?? null,
      last_seen_at:
        effectiveStatus === "connected"
          ? new Date().toISOString()
          : existing?.last_seen_at ?? null,
    };
    console.log("[WA][adopt whatsapp_instances]", payload);

    if (existing) {
      // Não mover a instância compartilhada de um canal para outro cada vez
      // que um modal é aberto. O isolamento pertence às tabelas de seleção.
      const { channel_id: _requestedChannelId, ...existingPatch } = payload;
      const { data: upd, error } = await (supabase as any)
        .from("whatsapp_instances")
        .update(existingPatch)
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

/**
 * Importa TODAS as instâncias já criadas na Evolution API para a conta do
 * usuário, para que apareçam em todos os modais de grupos/canais.
 */
export const importAllEvolutionInstances = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }): Promise<{ imported: number; names: string[] }> => {
    const { supabase, userId } = context;
    const { evolutionFetch } = await import("./evolution/client.server");
    const { getWhatsAppProvider } = await import("./index.server");
    const provider = getWhatsAppProvider("evolution");

    const res = await evolutionFetch("/instance/fetchInstances");
    const text = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    const arr: any[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.instances)
        ? parsed.instances
        : [];
    const names = arr
      .map((i) => i?.name ?? i?.instance?.instanceName ?? i?.instanceName ?? i?.instance?.name)
      .filter((n: unknown): n is string => typeof n === "string" && n.trim().length > 0)
      .map((n: string) => n.trim());

    let imported = 0;
    for (const instanceName of names) {
      let liveStatus: string | null = null;
      let livePhone: string | null = null;
      try {
        const st = await provider.getStatus(instanceName);
        liveStatus = st.status;
        livePhone = st.phone ?? null;
      } catch (err) {
        console.warn("[WA][importAll] getStatus falhou", instanceName, err);
      }

      const { data: existing } = await (supabase as any)
        .from("whatsapp_instances")
        .select("*")
        .eq("user_id", userId)
        .eq("instance_name", instanceName)
        .maybeSingle();

      const dbStatus: string | null = existing?.status ?? null;
      const effectiveStatus =
        liveStatus === "connected"
          ? "connected"
          : liveStatus === "disconnected"
            ? "disconnected"
            : (dbStatus ?? liveStatus ?? "disconnected");

      const payload = {
        user_id: userId,
        provider: "evolution",
        instance_name: instanceName,
        status: effectiveStatus,
        phone: livePhone ?? existing?.phone ?? null,
        qr_code: effectiveStatus === "connected" ? null : existing?.qr_code ?? null,
        last_seen_at:
          effectiveStatus === "connected"
            ? new Date().toISOString()
            : existing?.last_seen_at ?? null,
      };

      if (existing) {
        await (supabase as any)
          .from("whatsapp_instances")
          .update(payload)
          .eq("id", existing.id);
      } else {
        await (supabase as any)
          .from("whatsapp_instances")
          .insert({ ...payload, channel_id: null });
      }
      imported += 1;
    }

    return { imported, names };
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
  usedBy: Array<{ instanceId: string; instanceName: string }>;
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

    // 1) Todos os grupos disponíveis na Evolution para esta instância.
    let evoList: Array<{
      jid: string;
      name: string;
      participants: number | null;
      pictureUrl: string | null;
    }> = [];
    try {
      const { getWhatsAppProvider } = await import("./index.server");
      const groups = await getWhatsAppProvider(row.provider).fetchGroups(
        row.instance_name,
      );
      evoList = groups
        .filter((g) => g?.jid)
        .map((g) => ({
          jid: g.jid,
          name: g.name || "(grupo sem nome)",
          participants: g.participants ?? null,
          pictureUrl: g.pictureUrl ?? null,
        }));
    } catch (error) {
      // Não transformar falha da Evolution em uma lista vazia enganosa.
      throw new Error(
        error instanceof Error
          ? error.message
          : "Falha ao buscar os grupos na Evolution API",
      );
    }

    // 2) Seleção salva SOMENTE deste channel/grupo-config + instância.
    const { data: sel } = await (supabase as any)
      .from("whatsapp_group_selections")
      .select("group_jid, group_name")
      .eq("user_id", userId)
      .eq("instance_id", row.id)
      .eq("channel_id", data.channelId);
    const selRows: Array<{ group_jid: string; group_name: string | null }> = sel ?? [];
    const selectedSet = new Set(selRows.map((s) => s.group_jid));

    // 2b) Seleções deste canal em OUTRAS instâncias — para exibir "já em uso".
    const { data: otherSel } = await (supabase as any)
      .from("whatsapp_group_selections")
      .select("group_jid, instance_id")
      .eq("user_id", userId)
      .eq("channel_id", data.channelId)
      .neq("instance_id", row.id);
    const otherRows: Array<{ group_jid: string; instance_id: string }> = otherSel ?? [];
    const otherInstIds = Array.from(new Set(otherRows.map((r) => r.instance_id)));
    const instNameMap = new Map<string, string>();
    if (otherInstIds.length > 0) {
      const { data: insts } = await (supabase as any)
        .from("whatsapp_instances")
        .select("id, instance_name")
        .in("id", otherInstIds);
      for (const i of (insts ?? []) as any[]) instNameMap.set(i.id, i.instance_name);
    }
    const usedByMap = new Map<string, Array<{ instanceId: string; instanceName: string }>>();
    for (const r of otherRows) {
      const list = usedByMap.get(r.group_jid) ?? [];
      list.push({
        instanceId: r.instance_id,
        instanceName: instNameMap.get(r.instance_id) ?? "outra instância",
      });
      usedByMap.set(r.group_jid, list);
    }


    // Grupos salvos que não voltaram da Evolution continuam visíveis
    // para permitir desmarcar.
    const evoJids = new Set(evoList.map((e) => e.jid));
    for (const s of selRows) {
      if (!evoJids.has(s.group_jid)) {
        evoList.push({
          jid: s.group_jid,
          name: s.group_name || "(grupo sem nome)",
          participants: null,
          pictureUrl: null,
        });
      }
    }

    evoList.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    return evoList.map((g) => ({
      jid: g.jid,
      name: g.name,
      participants: g.participants,
      pictureUrl: g.pictureUrl,
      selected: selectedSet.has(g.jid),
      usedBy: usedByMap.get(g.jid) ?? [],
    }));
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

    // 1) Limpa a seleção atual desta instância para este canal.
    await (supabase as any)
      .from("whatsapp_group_selections")
      .delete()
      .eq("user_id", userId)
      .eq("instance_id", row.id)
      .eq("channel_id", data.channelId);

    // 2) Regra "um grupo → uma instância": remove os mesmos JIDs de
    //    QUALQUER outra instância deste canal, para não ficar duplicado
    //    ("empilhado") na tela de automação por grupo.
    if (data.groups.length > 0) {
      const jids = data.groups.map((g) => g.jid);
      await (supabase as any)
        .from("whatsapp_group_selections")
        .delete()
        .eq("user_id", userId)
        .eq("channel_id", data.channelId)
        .in("group_jid", jids)
        .neq("instance_id", row.id);

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
    throw new Error("Envio direto bloqueado: mensagens WhatsApp devem passar pelo CLAIM atômico da automação.");
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
      // LOTE 18A: DE/POR e vendidos decididos EXCLUSIVAMENTE pela camada central.
      // Nunca ler prod.sales / prod.sales_label / comparar original>promo aqui.
      const { resolveProductDisplay } = await import("@/modules/products/display-resolver");
      const display = resolveProductDisplay({
        title: prod.title ?? null,
        platform: prod.platform ?? null,
        promo_price: prod.promo_price ?? null,
        original_price: prod.original_price ?? null,
        sales_historical: prod.sales_historical ?? null,
        sales_source: prod.sales_source ?? null,
        price_quality: prod.price_quality ?? null,
      });
      product = {
        title: prod.title,
        description: null,
        price: display.priceCurrentDisplay ?? prod.promo_price ?? prod.original_price ?? null,
        price_original: display.priceOriginalDisplay,
        parcelamento: null,
        vendas: display.salesLabel || null,
        link: prod.affiliate_link,
        image: prod.image_url,
      };
    }
    if (!product) throw new Error("Produto ausente");
    if (!product.image) {
      throw new Error("Produto sem imagem. Rode o enriquecimento de imagens antes de enviar.");
    }

    throw new Error("Envio direto bloqueado: produtos WhatsApp devem passar pelo CLAIM atômico da automação.");

    // Renderiza usando o MESMO layout persistido no SaaS.
    const { loadLayoutFor, resolveHeader } = await import("@/modules/posts/layout.functions");
    const { renderPost } = await import("@/modules/posts/render");
    const layout = await loadLayoutFor(supabase, userId, (row as any).channel_id ?? null);
    const { data: recent } = await (supabase as any)
      .from("whatsapp_send_history")
      .select("caption")
      .eq("user_id", userId)
      .order("sent_at", { ascending: false })
      .limit(5);
    const recentHeaders = (recent ?? [])
      .map((r: any) => String(r.caption ?? "").split("\n")[0].trim())
      .filter(Boolean);
    // LOTE 18A: hasDiscount derivado do resolver (price_original só existe se HIGH).
    const hasDiscount = (product as any).price_original != null;
    const chosenHeader = await resolveHeader(supabase, userId, layout, recentHeaders, { hasDiscount });
    const caption = renderPost({ ...layout, header: chosenHeader }, product, "whatsapp");

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

    void caption;
    void targets;
    void productId;
    void sent;
    void failed;
    void errors;
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

    throw new Error("Envio direto bloqueado: campanhas WhatsApp devem passar pelo CLAIM atômico da automação.");

    let sent = 0;
    let failed = 0;
    const errors: Array<{ jid: string; error: string }> = [];
    return { sent, failed, errors };
  });
