import { useCallback, useEffect, useState } from "react";
import {
  importAllEvolutionInstances,
  listWhatsAppInstances,
  fetchWhatsAppGroups,
  type WhatsAppGroupDTO,
  type WhatsAppInstanceDTO,
} from "@/modules/whatsapp/instances.functions";

/**
 * Cache global compartilhado da lista de grupos WhatsApp por canal.
 * Todos os modais/consumidores da mesma página usam a MESMA lista real
 * vinda da Evolution API — abrir um segundo modal não recomeça o loading
 * do zero se já há dados cacheados, e um refresh atualiza todos os
 * consumidores abertos ao mesmo tempo.
 */

/**
 * Resolve a instância a ser usada dinamicamente: nunca há nome fixo.
 * Preferimos uma instância conectada; senão a mais recente disponível.
 */
async function resolveInstance(channelId: string): Promise<WhatsAppInstanceDTO | null> {
  try {
    await importAllEvolutionInstances({});
  } catch (err) {
    console.warn("[WA] importAll falhou:", err);
  }
  const rows = await listWhatsAppInstances({ data: { channelId } });
  return rows.find((r) => r.status === "connected") ?? rows[0] ?? null;
}

type CacheEntry = {
  instance: WhatsAppInstanceDTO | null;
  groups: WhatsAppGroupDTO[];
  error: string | null;
  loading: boolean;
  inflight: Promise<void> | null;
  listeners: Set<() => void>;
};

const cache = new Map<string, CacheEntry>();

function getEntry(channelId: string): CacheEntry {
  let e = cache.get(channelId);
  if (!e) {
    e = { instance: null, groups: [], error: null, loading: false, inflight: null, listeners: new Set() };
    cache.set(channelId, e);
  }
  return e;
}

function notify(entry: CacheEntry) {
  entry.listeners.forEach((fn) => fn());
}

async function loadInto(channelId: string, force: boolean): Promise<void> {
  const entry = getEntry(channelId);
  if (entry.inflight) return entry.inflight;
  if (!force && entry.groups.length > 0 && !entry.error) return;

  entry.loading = true;
  entry.error = null;
  notify(entry);

  const p = (async () => {
    try {
      let inst: WhatsAppInstanceDTO | null = entry.instance;
      try {
        inst = await resolveInstance(channelId);
      } catch (err) {
        // Falha transitória no provider não deve invalidar a instância —
        // se já temos uma no cache (conectada anteriormente), seguimos com ela.
        console.warn("[WA] adopt falhou, mantendo cache:", err);
      }
      entry.instance = inst;
      if (!inst) {
        entry.error = "Nenhuma instância WhatsApp conectada";
        entry.groups = [];
        return;
      }
      // Tenta buscar grupos independentemente do status reportado — a Evolution
      // às vezes devolve "connecting" transitório mas a listagem funciona.
      try {
        const gs = await fetchWhatsAppGroups({ data: { id: inst.id, channelId } });
        entry.groups = gs;
        entry.error = null;
      } catch (err) {
        if (entry.groups.length > 0) {
          // Mantém o cache válido; não derruba os modais por falha momentânea.
          console.warn("[WA] fetchGroups falhou, mantendo cache:", err);
          entry.error = null;
        } else if (inst.status !== "connected") {
          entry.error = "WhatsApp desconectado";
        } else {
          entry.error = err instanceof Error ? err.message : "Falha ao carregar grupos";
        }
      }
    } catch (err) {
      entry.error = err instanceof Error ? err.message : "Falha ao carregar grupos";
    } finally {
      entry.loading = false;
      entry.inflight = null;
      notify(entry);
    }
  })();
  entry.inflight = p;
  return p;
}

export interface UseWhatsAppGroupsResult {
  instance: WhatsAppInstanceDTO | null;
  groups: WhatsAppGroupDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Consome o cache compartilhado. Ao montar, dispara o load se ainda não
 * houver dados. `refresh()` força uma nova busca e atualiza todos os
 * consumidores registrados.
 */
export function useWhatsAppGroups(channelId: string, enabled = true): UseWhatsAppGroupsResult {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!enabled || !channelId) return;
    const entry = getEntry(channelId);
    const listener = () => setTick((n) => n + 1);
    entry.listeners.add(listener);
    // Dispara carregamento inicial se o cache está vazio.
    void loadInto(channelId, false);
    return () => {
      entry.listeners.delete(listener);
    };
  }, [channelId, enabled]);

  const entry = getEntry(channelId);
  const refresh = useCallback(async () => {
    await loadInto(channelId, true);
  }, [channelId]);

  return {
    instance: entry.instance,
    groups: entry.groups,
    loading: entry.loading,
    error: entry.error,
    refresh,
  };
}

/** Invalida o cache de um canal (ex.: após alterar seleção de grupos). */
export function invalidateWhatsAppGroups(channelId: string) {
  const entry = cache.get(channelId);
  if (!entry) return;
  entry.groups = [];
  void loadInto(channelId, true);
}
