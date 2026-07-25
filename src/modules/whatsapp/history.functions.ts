import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { apiClient } from "@/lib/api-client";

export interface SendHistoryRow {
  id: string;
  instance_id: string | null;
  instance_name: string | null;
  product_id: string | null;
  product_title: string | null;
  jid: string;
  caption: string | null;
  media_url: string | null;
  status: string;
  error: string | null;
  message_id: string | null;
  sent_at: string;
}

export const listWhatsAppSendHistory = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { status?: "sent" | "failed" | "all"; limit?: number } | undefined) => ({
    status: (data?.status ?? "all") as "sent" | "failed" | "all",
    limit: Math.min(Math.max(data?.limit ?? 50, 1), 200),
  }))
  .handler(async ({ data, context }): Promise<SendHistoryRow[]> => {
    const { supabase, userId } = context;
    let q = (supabase as any)
      .from("whatsapp_send_history")
      .select("id, instance_id, product_id, jid, caption, media_url, status, error, message_id, sent_at")
      .eq("user_id", userId)
      .order("sent_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const instIds = [...new Set((rows ?? []).map((r: any) => r.instance_id).filter(Boolean))] as string[];
    const prodIds = [...new Set((rows ?? []).map((r: any) => r.product_id).filter(Boolean))] as string[];
    const [{ data: insts }, { data: prods }] = await Promise.all([
      instIds.length
        ? (supabase as any).from("whatsapp_instances").select("id, instance_name").in("id", instIds)
        : Promise.resolve({ data: [] as any[] }),
      prodIds.length
        ? (supabase as any).from("products").select("id, title").in("id", prodIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const iMap = new Map<string, string>((insts ?? []).map((i: any) => [i.id, i.instance_name]));
    const pMap = new Map<string, string>((prods ?? []).map((p: any) => [p.id, p.title]));

    return (rows ?? []).map((r: any) => ({
      id: r.id,
      instance_id: r.instance_id,
      instance_name: r.instance_id ? iMap.get(r.instance_id) ?? null : null,
      product_id: r.product_id,
      product_title: r.product_id ? pMap.get(r.product_id) ?? null : null,
      jid: r.jid,
      caption: r.caption,
      media_url: r.media_url,
      status: r.status,
      error: r.error,
      message_id: r.message_id,
      sent_at: r.sent_at,
    }));
  });

export const resendWhatsAppSend = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { historyId: string }) => {
    if (!data?.historyId) throw new Error("historyId obrigatório");
    return { historyId: String(data.historyId) };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; messageId: string | null }> => {
    const { supabase, userId } = context;
    const { data: row, error } = await (supabase as any)
      .from("whatsapp_send_history")
      .select("id, instance_id, product_id, jid, caption, media_url")
      .eq("id", data.historyId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Envio não encontrado");
    if (!row.instance_id) throw new Error("Sem instância vinculada ao envio original");

    const { data: inst, error: iErr } = await (supabase as any)
      .from("whatsapp_instances")
      .select("id, instance_name, provider, status")
      .eq("id", row.instance_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (iErr) throw new Error(iErr.message);
    if (!inst) throw new Error("Instância não encontrada");

    const { getWhatsAppProvider } = await import("./index.server");
    const provider = getWhatsAppProvider(inst.provider);
    const live = await provider.getStatus(inst.instance_name);
    if (live.status !== "connected") throw new Error("Instância não conectada");

    let messageId: string | null = null;
    let status: "sent" | "failed" = "sent";
    let errMsg: string | null = null;
    try {
      const res = row.media_url
        ? await provider.sendMedia(inst.instance_name, row.jid, {
            mediaUrl: row.media_url,
            caption: row.caption ?? "",
          })
        : await provider.sendText(inst.instance_name, row.jid, row.caption ?? "");
      messageId = res.id ?? null;
    } catch (e) {
      status = "failed";
      errMsg = e instanceof Error ? e.message : String(e);
    }

    await (supabase as any).from("whatsapp_send_history").insert({
      user_id: userId,
      instance_id: row.instance_id,
      product_id: row.product_id,
      jid: row.jid,
      caption: row.caption,
      media_url: row.media_url,
      status,
      error: errMsg,
      message_id: messageId,
    });

    if (status === "failed") throw new Error(errMsg ?? "Falha ao reenviar");
    return { ok: true, messageId };
  });
