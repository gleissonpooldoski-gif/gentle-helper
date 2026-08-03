/**
 * Persistência do histórico de mensagens WhatsApp vindas do webhook da Evolution.
 * Best-effort: nunca deve interromper o processamento do webhook.
 */
export async function logEvolutionMessages(
  supabaseAdmin: any,
  instanceName: string,
  data: any,
): Promise<number> {
  const messages: any[] = Array.isArray(data?.messages) ? data.messages : data?.key ? [data] : [];
  if (!messages.length) return 0;

  const { data: inst } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("user_id")
    .eq("instance_name", instanceName)
    .maybeSingle();
  const userId = inst?.user_id;
  if (!userId) return 0;

  const rows = messages
    .map((m) => {
      const remoteJid: string = m?.key?.remoteJid ?? "";
      if (!remoteJid || remoteJid.endsWith("@g.us")) return null; // grupos ficam no fluxo de captura
      const fromMe = Boolean(m?.key?.fromMe);
      const text: string | null =
        m?.message?.conversation ??
        m?.message?.extendedTextMessage?.text ??
        m?.message?.imageMessage?.caption ??
        null;
      return {
        user_id: userId,
        instance_name: instanceName,
        phone: remoteJid.split("@")[0],
        message: text,
        direction: fromMe ? "outbound" : "inbound",
        status: fromMe ? "sent" : "received",
        message_id: m?.key?.id ?? null,
      };
    })
    .filter(Boolean);

  if (!rows.length) return 0;
  const { error } = await supabaseAdmin
    .from("whatsapp_messages")
    .upsert(rows, { onConflict: "instance_name,message_id,direction", ignoreDuplicates: true });
  if (error) console.warn("[WA][MSG-LOG] insert falhou:", error.message);
  return rows.length;
}
