import { useEffect, useState } from "react";

/**
 * Retorna um valor "atrasado" que só muda depois de `delayMs`
 * sem novas alterações. Ideal para inputs de busca — evita
 * re-render/refetch a cada tecla.
 */
export function useDebounced<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
