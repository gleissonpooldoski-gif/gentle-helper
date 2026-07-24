import type {
  WhatsAppProvider,
  WhatsAppProviderStatus,
  WhatsAppInstanceStatus,
  WhatsAppGroup,
} from "../provider";
import { evolutionFetch, evolutionJson } from "./client.server";

function mapState(state: string | undefined | null): WhatsAppInstanceStatus {
  switch ((state ?? "").toLowerCase()) {
    case "open":
      return "connected";
    case "connecting":
      return "awaiting_qr";
    case "close":
    case "closed":
      return "disconnected";
    default:
      return "disconnected";
  }
}

function normalizeQr(raw: any): { base64: string | null; code: string | null } {
  const base64 =
    raw?.base64 ??
    raw?.qrcode?.base64 ??
    raw?.qrcode ??
    raw?.qr ??
    null;
  const code = raw?.code ?? raw?.qrcode?.code ?? raw?.pairingCode ?? null;
  let b64: string | null = null;
  if (typeof base64 === "string" && base64.length > 0) {
    b64 = base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
  }
  return { base64: b64, code: typeof code === "string" ? code : null };
}

async function fetchQr(instanceName: string): Promise<{ base64: string | null; code: string | null }> {
  try {
    const res = await evolutionFetch(
      `/instance/connect/${encodeURIComponent(instanceName)}`,
      { method: "GET" },
    );
    if (!res.ok) return { base64: null, code: null };
    const text = await res.text();
    if (!text) return { base64: null, code: null };
    try {
      return normalizeQr(JSON.parse(text));
    } catch {
      return { base64: null, code: null };
    }
  } catch {
    return { base64: null, code: null };
  }
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
      body.webhook = {
        url: webhookUrl,
        byEvents: false,
        base64: true,
        events: ["QRCODE_UPDATED", "CONNECTION_UPDATE"],
      };
      // compat: algumas versões usam webhookUrl no root
      body.webhookUrl = webhookUrl;
      body.webhook_by_events = false;
      body.events = ["QRCODE_UPDATED", "CONNECTION_UPDATE"];
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
    const qr = await fetchQr(instanceName);
    const state = await this.getStatus(instanceName);
    return {
      status: state.status === "connected" ? "connected" : "awaiting_qr",
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
    } catch {
      return { status: "disconnected", phone: null, qr: null };
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
};
