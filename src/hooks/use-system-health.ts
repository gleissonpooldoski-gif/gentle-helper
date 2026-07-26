import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { countUnresolvedFailures } from "@/modules/dlq/dlq.functions";
import { listInstances } from "@/modules/whatsapp/instances.functions";

/**
 * Health check global: falhas pendentes + instâncias caídas.
 * Usado pela sidebar para badges vermelhas e por toasts persistentes.
 */
export function useSystemHealth() {
  const countFailuresFn = useServerFn(countUnresolvedFailures);
  const listInstancesFn = useServerFn(listInstances);

  const failuresQ = useQuery({
    queryKey: ["dlq-count"],
    queryFn: () => countFailuresFn(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const instancesQ = useQuery({
    queryKey: ["instances-health"],
    queryFn: () => listInstancesFn(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const downInstances = (instancesQ.data ?? []).filter(
    (i) => i.status !== "connected" && i.status !== "open",
  );

  return {
    failures: failuresQ.data ?? 0,
    downInstances,
    downCount: downInstances.length,
  };
}
