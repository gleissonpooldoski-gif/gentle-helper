/**
 * Operações do painel WhatsApp contra a Evolution API (v2.3.7).
 * Server-only: recebe a config já resolvida por usuário.
 */
import { evolutionFetch, evolutionJson } from "./client.server";
import type { ResolvedEvolutionConfig } from "./user-config.server";
import type {
  EvolutionConnectionState,
  EvolutionInstanceSummary,
} from "./user-settings.functions";

function mapState(state: unknown): EvolutionConnectionState["status"] {
  switch (String(state ?? "").toLowerCase()) {
    case "open":
    case "connected":
      return "connected";
    case "connecting":
    case "qr":
    case "syncing":
      return "awaiting_qr";
    case "close":
    case "closed":
    case "disconnected":
      return "disconnected";
    default:
      return "unknown";
  }
}

function normalizeInstances(raw: unknown): EvolutionInstanceSummary[] {
  const arr: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as any)?.instances)
      ? (raw as any).instances
      : [];
  return arr.map((i) => {
    const inst = i?.instance ?? i;
    const owner: string = inst?.ownerJid ?? inst?.owner ?? inst?.number ?? "";
    return {
      name: String(inst?.name ?? inst?.instanceName ?? ""),
      state: String(inst?.connectionStatus ?? inst?.state ?? inst?.status ?? "unknown"),
      phone: owner ? String(owner).split("@")[0] : null,
      profileName: inst?.profileName ?? inst?.profileStatus ?? null,
    };
  }).filter((i) => i.name);
}

function normalizeQr(raw: any): { qrCode: string | null; pairingCode: string | null } {
  const src = raw?.qrcode ?? raw?.qr ?? raw ?? {};
  const b64 = src?.base64 ?? raw?.base64 ?? null;
  const code = src?.pairingCode ?? raw?.pairingCode ?? src?.code ?? null;
  return {
    qrCode:
      typeof b64 === "string" && b64
        ? b64.startsWith("data:")
          ? b64
          : `data:image/png;base64,${b64}`
        : null,
    pairingCode: typeof code === "string" ? code : null,
  };
}

export async function readEvolutionConnectionState(
  cfg: ResolvedEvolutionConfig,
): Promise<EvolutionConnectionState> {
  const raw = await evolutionJson<unknown>("/instance/fetchInstances", {
    config: cfg,
    timeoutMs: 10_000,
  });
  const instances = normalizeInstances(raw);
  const target = cfg.instanceName
    ? instances.find((i) => i.name.trim().toUpperCase() === cfg.instanceName!.trim().toUpperCase())
    : undefined;

  return {
    configured: true,
    instanceName: cfg.instanceName,
    status: target ? mapState(target.state) : cfg.instanceName ? "disconnected" : "unknown",
    phone: target?.phone ?? null,
    lastActivity: new Date().toISOString(),
    message: target
      ? `Instância "${target.name}" em estado ${target.state}.`
      : cfg.instanceName
        ? `Instância "${cfg.instanceName}" não encontrada na Evolution API.`
        : "Nenhuma instância padrão definida.",
    instances,
  };
}

export async function createRemoteInstance(
  cfg: ResolvedEvolutionConfig,
  instanceName: string,
): Promise<string | null> {
  const json = await evolutionJson<any>("/instance/create", {
    config: cfg,
    method: "POST",
    timeoutMs: 20_000,
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
  });
  return normalizeQr(json).qrCode;
}

export async function connectRemoteInstance(
  cfg: ResolvedEvolutionConfig,
  instanceName: string,
): Promise<{ qrCode: string | null; pairingCode: string | null; status: string }> {
  const json = await evolutionJson<any>(
    `/instance/connect/${encodeURIComponent(instanceName)}`,
    { config: cfg, timeoutMs: 20_000 },
  );
  const qr = normalizeQr(json);
  return {
    ...qr,
    status: qr.qrCode || qr.pairingCode ? "awaiting_qr" : String(json?.instance?.state ?? "unknown"),
  };
}

export async function logoutRemoteInstance(
  cfg: ResolvedEvolutionConfig,
  instanceName: string,
): Promise<{ ok: boolean; message: string }> {
  const res = await evolutionFetch(`/instance/logout/${encodeURIComponent(instanceName)}`, {
    config: cfg,
    method: "DELETE",
    timeoutMs: 15_000,
    retries: 0,
  });
  const text = await res.text();
  return {
    ok: res.ok,
    message: res.ok ? "WhatsApp desconectado." : `Evolution ${res.status}: ${text.slice(0, 200)}`,
  };
}

export async function sendTextViaEvolution(
  cfg: ResolvedEvolutionConfig,
  instanceName: string,
  number: string,
  text: string,
): Promise<{ ok: boolean; messageId: string | null; error: string | null }> {
  const res = await evolutionFetch(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    config: cfg,
    method: "POST",
    timeoutMs: 20_000,
    retries: 0, // sem retry oculto: evita mensagem duplicada
    body: JSON.stringify({ number, text }),
  });
  const raw = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    return { ok: false, messageId: null, error: `Evolution ${res.status}: ${raw.slice(0, 300)}` };
  }
  return { ok: true, messageId: parsed?.key?.id ?? parsed?.messageId ?? null, error: null };
}
