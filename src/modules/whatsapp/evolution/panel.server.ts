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

/** Log estruturado single-line (nunca imprime a apikey). */
export function evoLog(event: string, payload: Record<string, unknown> = {}) {
  try {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ tag: "EVOLUTION", event, ...payload }));
  } catch {
    // ignore
  }
}

export async function listRemoteInstances(
  cfg: ResolvedEvolutionConfig,
): Promise<EvolutionInstanceSummary[]> {
  const raw = await evolutionJson<unknown>("/instance/fetchInstances", {
    config: cfg,
    timeoutMs: 10_000,
  });
  const instances = normalizeInstances(raw);
  evoLog("FETCH_INSTANCES", { count: instances.length, names: instances.map((i) => i.name) });
  return instances;
}

/**
 * A Evolution API 2.x é case/space sensitive no path.
 * Resolvemos o nome exato conferindo a lista real de instâncias.
 */
export async function resolveRemoteInstanceName(
  cfg: ResolvedEvolutionConfig,
  wanted: string,
): Promise<{ name: string; found: boolean; available: string[] }> {
  const instances = await listRemoteInstances(cfg);
  const available = instances.map((i) => i.name);
  const target = wanted.trim();
  const exact = available.find((n) => n === target);
  if (exact) return { name: exact, found: true, available };
  const loose = available.find(
    (n) => n.trim().toLowerCase() === target.toLowerCase(),
  );
  if (loose) return { name: loose, found: true, available };
  return { name: target, found: false, available };
}

function notFoundError(wanted: string, available: string[]): Error {
  return new Error(
    `A instância "${wanted}" não existe na Evolution API.` +
      (available.length
        ? ` Instâncias disponíveis: ${available.join(", ")}.`
        : " Nenhuma instância encontrada nesta Evolution API."),
  );
}


export async function readEvolutionConnectionState(
  cfg: ResolvedEvolutionConfig,
): Promise<EvolutionConnectionState> {
  const instances = await listRemoteInstances(cfg);
  const target = cfg.instanceName
    ? instances.find((i) => i.name.trim().toUpperCase() === cfg.instanceName!.trim().toUpperCase())
    : undefined;

  evoLog("CONNECTION_STATE", {
    instanceName: cfg.instanceName,
    found: Boolean(target),
    state: target?.state ?? null,
    source: cfg.source,
  });

  return {
    configured: true,
    instanceName: cfg.instanceName,
    status: target ? mapState(target.state) : cfg.instanceName ? "disconnected" : "unknown",
    phone: target?.phone ?? null,
    lastActivity: new Date().toISOString(),
    message: target
      ? `Instância "${target.name}" em estado ${target.state}.`
      : cfg.instanceName
        ? `A instância "${cfg.instanceName}" não existe na Evolution API.${
            instances.length ? ` Disponíveis: ${instances.map((i) => i.name).join(", ")}.` : ""
          }`
        : instances.length
          ? `Selecione uma instância. Disponíveis: ${instances.map((i) => i.name).join(", ")}.`
          : "Nenhuma instância encontrada nesta Evolution API.",
    instances,
  };
}

export async function createRemoteInstance(
  cfg: ResolvedEvolutionConfig,
  instanceName: string,
): Promise<string | null> {
  const existing = await resolveRemoteInstanceName(cfg, instanceName);
  if (existing.found) {
    // Já existe: não recriar (a Evolution devolve 403). Apenas pedir o QR.
    evoLog("INSTANCE_EXISTS", { instanceName: existing.name });
    const conn = await connectRemoteInstance(cfg, existing.name);
    return conn.qrCode;
  }
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
  evoLog("INSTANCE_CREATED", { instanceName });
  return normalizeQr(json).qrCode;
}

export async function connectRemoteInstance(
  cfg: ResolvedEvolutionConfig,
  instanceName: string,
): Promise<{ qrCode: string | null; pairingCode: string | null; status: string }> {
  const resolved = await resolveRemoteInstanceName(cfg, instanceName);
  if (!resolved.found) {
    evoLog("CONNECT_NOT_FOUND", { instanceName, available: resolved.available });
    throw notFoundError(instanceName, resolved.available);
  }
  const json = await evolutionJson<any>(
    `/instance/connect/${encodeURIComponent(resolved.name)}`,
    { config: cfg, timeoutMs: 20_000 },
  );
  const qr = normalizeQr(json);
  const rawState = String(json?.instance?.state ?? json?.state ?? "").toLowerCase();
  const status = qr.qrCode || qr.pairingCode ? "awaiting_qr" : mapState(rawState);
  evoLog("CONNECT", {
    instanceName: resolved.name,
    hasQr: Boolean(qr.qrCode),
    hasPairing: Boolean(qr.pairingCode),
    status,
  });
  if (status === "connected") {
    return { ...qr, status: "connected" };
  }
  if (!qr.qrCode && !qr.pairingCode) {
    throw new Error(
      `A Evolution não retornou QR para "${resolved.name}" (estado: ${rawState || "desconhecido"}). Desconecte a instância e tente novamente.`,
    );
  }
  return { ...qr, status };
}

export async function logoutRemoteInstance(
  cfg: ResolvedEvolutionConfig,
  instanceName: string,
): Promise<{ ok: boolean; message: string }> {
  const resolved = await resolveRemoteInstanceName(cfg, instanceName);
  if (!resolved.found) throw notFoundError(instanceName, resolved.available);
  const res = await evolutionFetch(`/instance/logout/${encodeURIComponent(resolved.name)}`, {
    config: cfg,
    method: "DELETE",
    timeoutMs: 15_000,
    retries: 0,
  });
  const text = await res.text();
  evoLog("LOGOUT", { instanceName: resolved.name, status: res.status });
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
