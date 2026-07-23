/**
 * Browser-only Magalu affiliate config store.
 * No external API, no auth header — persists the store name in localStorage
 * so the setting survives page reloads.
 */
export type MagaluLocalConfig = {
  storeName: string;
  status: "connected" | "pending";
  updatedAt: string | null;
};

const KEY = "affiliate.magalu.config.v1";

export function loadMagaluLocal(): MagaluLocalConfig {
  if (typeof window === "undefined") {
    return { storeName: "", status: "pending", updatedAt: null };
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { storeName: "", status: "pending", updatedAt: null };
    const parsed = JSON.parse(raw) as Partial<MagaluLocalConfig>;
    const storeName = String(parsed.storeName ?? "").trim();
    return {
      storeName,
      status: storeName ? "connected" : "pending",
      updatedAt: parsed.updatedAt ?? null,
    };
  } catch {
    return { storeName: "", status: "pending", updatedAt: null };
  }
}

export function saveMagaluLocal(storeName: string): MagaluLocalConfig {
  const trimmed = storeName.trim();
  if (!trimmed) throw new Error("Informe o nome da loja Magalu");
  const value: MagaluLocalConfig = {
    storeName: trimmed,
    status: "connected",
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  }
  return value;
}

export function getMagaluStoreName(): string | null {
  return loadMagaluLocal().storeName || null;
}
