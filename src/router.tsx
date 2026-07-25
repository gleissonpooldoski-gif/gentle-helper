import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Cache-first defaults: evita refetch a cada foco e mantém dados quentes
  // por 30s. Mutations continuam invalidando explicitamente com
  // queryClient.invalidateQueries — nada muda em quem já usa isso.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Prefetch da rota assim que o usuário faz hover/focus num <Link>.
    // Navegação vira instantânea sem custo extra em quem não interage.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    // Reduz o "flash" de pendingComponent em navegações rápidas.
    defaultPendingMs: 400,
    defaultPendingMinMs: 200,
  });

  return router;
};
