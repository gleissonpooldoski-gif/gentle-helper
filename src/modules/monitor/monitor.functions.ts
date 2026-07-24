import { createServerFn } from "@tanstack/react-start";
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
    const { data: instances } = await (supabase as any)
      .from("whatsapp_instances")
      .select("id, provider, instance_name, status")
      .eq("user_id", userId)
      .eq("channel_id", data.channelId);

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

    for (const inst of instances ?? []) {
      try {
        const groups = await getWhatsAppProvider(inst.provider).fetchGroups(
          inst.instance_name,
        );
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
      } catch {
        /* segue tentando as demais instâncias */
      }
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

    // Remove tudo do canal, depois insere a nova seleção (idempotente).
    await (supabase as any)
      .from("monitored_groups")
      .delete()
      .eq("user_id", userId)
      .eq("channel_id", data.channelId);

    if (data.groups.length > 0) {
      const rows = data.groups.map((g) => ({
        user_id: userId,
        channel_id: data.channelId,
        group_jid: g.jid,
        group_name: g.name,
        platform: g.platform,
        is_active: true,
      }));
      const { error } = await (supabase as any)
        .from("monitored_groups")
        .insert(rows);
      if (error) throw new Error(error.message);
    }

    return { ok: true, count: data.groups.length };
  });
