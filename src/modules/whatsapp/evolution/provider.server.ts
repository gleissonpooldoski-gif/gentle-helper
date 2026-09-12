import type {
  WhatsAppProvider,
  WhatsAppProviderStatus,
  WhatsAppInstanceStatus,
  WhatsAppGroup,
} from "../provider";
import { evolutionFetch, evolutionJson, isSocketClosedText } from "./client.server";

function isSocketClosedError(err: unknown): boolean {
  return (
    (err as any)?.code === "SOCKET_CLOSED" ||
    isSocketClosedText((err as Error)?.message ?? String(err))
  );
}

/**
 * Socket Baileys travado (`Connection Closed`): reinicia a instância na
 * Evolution e aguarda o socket subir novamente.
 */
async function restartInstance(instanceName: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.warn(`[Evolution] socket travado, reiniciando instância ${instanceName}`);
  try {
    const response = await evolutionFetch(`/instance/restart/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      retries: 0,
      timeoutMs: 20_000,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 300)}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[Evolution] restart falhou:", (err as Error)?.message ?? err);
  }
  // Aguarda o socket realmente voltar em vez de depender de uma pausa fixa.
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise((r) => setTimeout(r, attempt === 0 ? 3_000 : 2_000));
    try {
      const state = await evolutionJson<any>(
        `/instance/connectionState/${encodeURIComponent(instanceName)}`,
        { method: "GET", retries: 0, timeoutMs: 10_000 },
      );
      const value = state?.instance?.state ?? state?.state ?? state?.status;
      if (mapState(value) === "connected") return;
    } catch {
      // A Evolution ainda está reiniciando; continua dentro do limite.
    }
  }
  throw new Error(`A sessão ${instanceName} não voltou após a reinicialização automática.`);
}

function mapState(state: string | undefined | null): WhatsAppInstanceStatus {
  switch ((state ?? "").toLowerCase()) {
    case "open":
    case "connected":
      return "connected";
    case "connecting":
    case "syncing":
      return "connecting";
    case "close":
    case "closed":
    case "disconnected":
      return "disconnected";
    default:
      return "disconnected";
  }
}

function normalizeQr(raw: any): { base64: string | null; code: string | null } {
  const base64 =
    raw?.base64 ??
    raw?.qrcode?.base64 ??
    raw?.qr?.base64 ??
    raw?.qrcode ??
    raw?.qr ??
    null;
  const code =
    raw?.code ??
    raw?.qrcode?.code ??
    raw?.qr?.code ??
    raw?.pairingCode ??
    null;
  let b64: string | null = null;
  if (typeof base64 === "string" && base64.length > 0) {
    b64 = base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
  }
  return { base64: b64, code: typeof code === "string" ? code : null };
}

async function tryConnect(
  instanceName: string,
  method: "GET" | "POST",
): Promise<any | null> {
  try {
    const res = await evolutionFetch(
      `/instance/connect/${encodeURIComponent(instanceName)}`,
      { method },
    );
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.log(`[Evolution] /instance/connect ${method} status`, res.status);
      return null;
    }
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

async function fetchQr(instanceName: string): Promise<{ base64: string | null; code: string | null }> {
  // Alguns builds da Evolution só devolvem QR em GET, outros em POST.
  let json = await tryConnect(instanceName, "GET");
  const firstQr = json ? normalizeQr(json?.qrcode ?? json) : { base64: null, code: null };
  if (!firstQr.base64 && !firstQr.code) {
    const alt = await tryConnect(instanceName, "POST");
    if (alt) json = alt;
  }
  // eslint-disable-next-line no-console
  console.log(
    "Evolution connect response:",
    typeof json === "object" ? JSON.stringify(json).slice(0, 800) : String(json),
  );
  const q = normalizeQr(json?.qrcode ?? json);
  // eslint-disable-next-line no-console
  console.log("Evolution QR fields:", {
    base64: !!json?.base64,
    qrcode: !!json?.qrcode,
    qrcodeBase64: !!json?.qrcode?.base64,
    qr: !!json?.qr,
    qrBase64: !!json?.qr?.base64,
    resolved: !!q.base64,
  });
  return q;
}

export const evolutionProvider: WhatsAppProvider = {
  name: "evolution",

  async createInstance({ instanceName, webhookUrl }): Promise<WhatsAppProviderStatus> {
    // Se já existe, apenas reconecta
    const existing = await evolutionFetch(
      `/instance/connectionState/${encodeURIComponent(instanceName)}`,
      { method: "GET" },
    );
    if (existing.ok) {
      return this.reconnect(instanceName);
    }

    const body: Record<string, unknown> = {
      instanceName,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
    };
    if (webhookUrl) {
      const events = ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT"];
      body.webhook = { url: webhookUrl, byEvents: false, base64: true, events };
      // compat: algumas versões usam webhookUrl no root
      body.webhookUrl = webhookUrl;
      body.webhook_by_events = false;
      body.events = events;
    }

    const created = await evolutionJson<any>(`/instance/create`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    const qr = normalizeQr(created?.qrcode ?? created);
    return {
      status: "awaiting_qr",
      phone: null,
      qr: qr.base64 || qr.code ? qr : null,
    };
  },

  async reconnect(instanceName): Promise<WhatsAppProviderStatus> {
    // Se já está conectado, não pede QR.
    const state = await this.getStatus(instanceName);
    // eslint-disable-next-line no-console
    console.log("Evolution status", instanceName, state.status);
    if (state.status === "connected") {
      return { status: "connected", phone: state.phone, qr: null };
    }
    const qr = await fetchQr(instanceName);
    // eslint-disable-next-line no-console
    console.log("Evolution QR", !!qr.base64, !!qr.code);
    return {
      status: "awaiting_qr",
      phone: state.phone,
      qr: qr.base64 || qr.code ? qr : null,
    };
  },

  async getStatus(instanceName): Promise<WhatsAppProviderStatus> {
    try {
      const res = await evolutionJson<any>(
        `/instance/connectionState/${encodeURIComponent(instanceName)}`,
        { method: "GET" },
      );
      const state = res?.instance?.state ?? res?.state ?? res?.status;
      // Log obrigatório: connectionState recebido
      // eslint-disable-next-line no-console
      console.log(`[Evolution] connectionState recebido: ${state ?? "null"} (instance=${instanceName})`);
      const status = mapState(state);
      const phone =
        res?.instance?.owner ??
        res?.instance?.wuid ??
        res?.wuid ??
        null;
      return {
        status,
        phone: typeof phone === "string" ? phone.split("@")[0] : null,
        qr: null,
      };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[Evolution] connectionState falhou (instance=${instanceName}):`, err);
      // Falha de rede não significa que a sessão está desconectada. Propagar o
      // erro impede o painel de chamar /instance/connect e entrar em ciclo de QR.
      throw new Error(
        `Evolution API indisponível: ${err instanceof Error ? err.message : "falha de conexão"}`,
      );
    }
  },


  async disconnect(instanceName): Promise<void> {
    await evolutionFetch(`/instance/logout/${encodeURIComponent(instanceName)}`, {
      method: "DELETE",
    });
  },

  async deleteInstance(instanceName): Promise<void> {
    // logout tolerante (pode falhar se já desconectada)
    try {
      await evolutionFetch(`/instance/logout/${encodeURIComponent(instanceName)}`, {
        method: "DELETE",
      });
    } catch {
      /* ignore */
    }
    await evolutionFetch(`/instance/delete/${encodeURIComponent(instanceName)}`, {
      method: "DELETE",
    });
  },

  async fetchGroups(instanceName): Promise<WhatsAppGroup[]> {
    const path = `/group/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=false`;
    // Em contas com muitos grupos, a Evolution pode levar mais que o timeout
    // padrão de 15s para montar a lista, mesmo sem participantes.
    let res: any;
    try {
      res = await evolutionJson<any>(path, { method: "GET", timeoutMs: 60_000 });
    } catch (err) {
      if (!isSocketClosedError(err)) throw err;
      // Auto-recuperação: reinicia o socket e tenta mais uma vez.
      await restartInstance(instanceName);
      res = await evolutionJson<any>(path, { method: "GET", timeoutMs: 60_000 });
    }
    const arr: any[] = Array.isArray(res)
      ? res
      : Array.isArray(res?.groups)
        ? res.groups
        : Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res?.response)
            ? res.response
            : [];
    return arr
      .map((g) => {
        const jid: string = g?.id ?? g?.jid ?? g?.remoteJid ?? "";
        if (!jid || !jid.includes("@g.us")) return null;
        return {
          jid,
          name: String(g?.subject ?? g?.name ?? jid),
          participants:
            typeof g?.size === "number"
              ? g.size
              : Array.isArray(g?.participants)
                ? g.participants.length
                : null,
          pictureUrl: g?.pictureUrl ?? g?.profilePicUrl ?? null,
        } as WhatsAppGroup;
      })
      .filter((x): x is WhatsAppGroup => !!x);
  },

  async setWebhook(instanceName, webhookUrl, events): Promise<void> {
    const evs = events ?? ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT"];
    const body = {
      webhook: { url: webhookUrl, enabled: true, byEvents: false, base64: true, events: evs },
      // compat com diferentes builds
      url: webhookUrl,
      enabled: true,
      webhook_by_events: false,
      events: evs,
    };
    try {
      await evolutionJson(`/webhook/set/${encodeURIComponent(instanceName)}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.warn("[WA] setWebhook falhou:", (err as Error).message);
    }
  },

  async sendText(): Promise<{ id?: string }> {
    throw new Error(
      "Envio direto bloqueado: mensagens WhatsApp devem passar pelo CLAIM atômico da automação.",
    );
  },

  async sendMedia(): Promise<{ id?: string }> {
    throw new Error(
      "Envio direto bloqueado: mídia WhatsApp deve passar pelo CLAIM atômico da automação.",
    );
  },
};
