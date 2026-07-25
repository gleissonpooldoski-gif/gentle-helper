import { createServerFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { apiClient } from "@/lib/api-client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function toUuidOrNull(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  return UUID_RE.test(s) ? s : null;
}

export interface MonitorGroupDTO {
  jid: string;
  name: string;
  platform: string;
  status: "available" | "unavailable";
  selected: boolean;
  participants: number | null;
  pictureUrl: string | null;
}

/**
 * Busca a lista atualizada de grupos da(s) conexão(ões) ativas do canal
 * (Evolution/WhatsApp) e mescla com os grupos já marcados em monitored_groups.
 */
export const listMonitorGroups = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { channelId: string }) => {
    const channelId = toUuidOrNull(data?.channelId);
    if (!channelId) throw new Error("channelId inválido");
    return { channelId };
  })
  .handler(async ({ data, context }): Promise<MonitorGroupDTO[]> => {
    const { supabase, userId } = context;

    // Instâncias de WhatsApp vinculadas a este canal (Evolution etc.).
    const { data: instances, error: instancesError } = await (supabase as any)
      .from("whatsapp_instances")
      .select("id, provider, instance_name, status")
      .eq("user_id", userId)
      .or(`channel_id.eq.${data.channelId},instance_name.eq.DIVULGA LINKS`);
    if (instancesError) throw new Error(instancesError.message);

    const instanceIds = (instances ?? []).map((i: any) => i.id);

    const { getWhatsAppProvider } = await import(
      "@/modules/whatsapp/index.server"
    );

    const fresh = new Map<
      string,
      {
        name: string;
        platform: string;
        participants: number | null;
        pictureUrl: string | null;
      }
    >();
    let successfulProviderFetches = 0;
    let lastProviderError: unknown = null;

    for (const inst of instances ?? []) {
      try {
        const groups = await getWhatsAppProvider(inst.provider).fetchGroups(
          inst.instance_name,
        );
        successfulProviderFetches += 1;
        for (const g of groups) {
          if (!g?.jid) continue;
          if (!fresh.has(g.jid)) {
            fresh.set(g.jid, {
              name: g.name || "(grupo sem nome)",
              platform: "whatsapp",
              participants: g.participants ?? null,
              pictureUrl: g.pictureUrl ?? null,
            });
          }
        }
      } catch (error) {
        lastProviderError = error;
        console.warn(
          `[WA] Falha ao buscar grupos da instância ${inst.instance_name}:`,
          error,
        );
      }
    }

    if ((instances ?? []).length > 0 && successfulProviderFetches === 0) {
      // Uma falha de todas as chamadas deve chegar à interface em vez de
      // parecer que o usuário não participa de nenhum grupo.
      const connectedInstances = (instances ?? []).filter(
        (inst: any) => inst.status === "connected",
      );
      if (connectedInstances.length === 0) {
        throw new Error("WhatsApp desconectado. Atualize o status da instância.");
      }
      throw new Error(
        lastProviderError instanceof Error
          ? lastProviderError.message
          : "Falha ao buscar os grupos na Evolution API",
      );
    }

    // Seleção existente — SOMENTE das instâncias deste canal (isolamento por instância).
    let monitored: Array<{ group_jid: string; group_name: string | null; platform: string | null; is_active: boolean }> = [];
    if (instanceIds.length > 0) {
      const { data: rows } = await (supabase as any)
        .from("monitored_groups")
        .select("group_jid, group_name, platform, is_active")
        .eq("user_id", userId)
        .eq("channel_id", data.channelId)
        .in("instance_id", instanceIds);
      monitored = rows ?? [];
    }

    const selectedSet = new Set<string>();
    for (const m of monitored) {
      if (m.is_active) selectedSet.add(m.group_jid);
      // Grupo salvo que não aparece mais na conta continua exibido como
      // "unavailable" para permitir desmarcar.
      if (!fresh.has(m.group_jid)) {
        fresh.set(m.group_jid, {
          name: m.group_name || "(grupo sem nome)",
          platform: m.platform || "whatsapp",
          participants: null,
          pictureUrl: null,
        });
      }
    }

    const out: MonitorGroupDTO[] = [];
    for (const [jid, info] of fresh.entries()) {
      const isFromEvolution = (instances ?? []).length > 0;
      out.push({
        jid,
        name: info.name,
        platform: info.platform,
        status: isFromEvolution ? "available" : "unavailable",
        selected: selectedSet.has(jid),
        participants: info.participants,
        pictureUrl: info.pictureUrl,
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return out;
  });


/** Substitui a lista de grupos monitorados do canal (máx. 5). */
export const saveMonitorGroups = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator(
    (data: {
      channelId: string;
      groups: Array<{ jid: string; name?: string; platform?: string }>;
    }) => {
      const channelId = toUuidOrNull(data?.channelId);
      if (!channelId) throw new Error("channelId inválido");
      const groups = Array.isArray(data?.groups) ? data.groups : [];
      if (groups.length > 5) throw new Error("Máximo de 5 grupos");
      return {
        channelId,
        groups: groups
          .filter((g) => g && typeof g.jid === "string" && g.jid.trim())
          .map((g) => ({
            jid: g.jid.trim(),
            name: (g.name ?? "").trim() || "(grupo sem nome)",
            platform: (g.platform ?? "whatsapp").trim() || "whatsapp",
          })),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Resolve as instâncias WhatsApp deste canal — a seleção é por instância.
    const { data: instances, error: instancesError } = await (supabase as any)
      .from("whatsapp_instances")
      .select("id")
      .eq("user_id", userId)
      .or(`channel_id.eq.${data.channelId},instance_name.eq.DIVULGA LINKS`);
    if (instancesError) throw new Error(instancesError.message);
    const instanceIds: string[] = (instances ?? []).map((i: any) => i.id);
    if (instanceIds.length === 0) {
      throw new Error(
        "Nenhuma instância WhatsApp vinculada a este canal. Conecte uma instância antes de salvar grupos.",
      );
    }

    const keepJids = data.groups.map((g) => g.jid);

    // Remove vínculos das instâncias deste canal que não estão mais na seleção.
    {
      let del = (supabase as any)
        .from("monitored_groups")
        .delete()
        .eq("user_id", userId)
        .eq("channel_id", data.channelId)
        .in("instance_id", instanceIds);
      if (keepJids.length > 0) {
        del = del.not(
          "group_jid",
          "in",
          `(${keepJids.map((j) => `"${j}"`).join(",")})`,
        );
      }
      await del;
    }

    if (data.groups.length > 0) {
      const rows: any[] = [];
      for (const instId of instanceIds) {
        for (const g of data.groups) {
          rows.push({
            user_id: userId,
            channel_id: data.channelId,
            instance_id: instId,
            group_jid: g.jid,
            group_name: g.name,
            platform: g.platform,
            is_active: true,
          });
        }
      }
      const { error } = await (supabase as any)
        .from("monitored_groups")
        .upsert(rows, { onConflict: "user_id,instance_id,group_jid" });
      if (error) throw new Error(error.message);
    }
    // Garante que o webhook da Evolution está registrado para MESSAGES_UPSERT
    // em cada instância vinculada — sem isso, mensagens dos grupos monitorados
    // nunca chegam até o capturador.
    if (data.groups.length > 0) {
      try {
        const { getWhatsAppProvider } = await import("@/modules/whatsapp/index.server");
        const { data: instRows } = await (supabase as any)
          .from("whatsapp_instances")
          .select("provider, instance_name")
          .in("id", instanceIds);
        const proto = "https";
        const host = (context as any)?.request?.headers?.get?.("host") ?? null;
        const webhookUrl = host
          ? `${proto}://${host}/api/public/whatsapp/webhook`
          : null;
        if (webhookUrl) {
          for (const inst of instRows ?? []) {
            const p = getWhatsAppProvider(inst.provider);
            if (typeof p.setWebhook === "function") {
              await p.setWebhook(inst.instance_name, webhookUrl, [
                "QRCODE_UPDATED",
                "CONNECTION_UPDATE",
                "MESSAGES_UPSERT",
              ]);
            }
          }
        }
      } catch (err) {
        console.warn("[MONITOR] setWebhook falhou:", (err as Error).message);
      }
    }

    return { ok: true, count: data.groups.length };
  });

