/**
 * Fonte ÚNICA de verdade para humanizar contagem de vendas (padrão Shopee).
 *
 * Regras oficiais:
 *  - n < 1000           → número inteiro cru (ex: 380 → "380")
 *  - 1_000 ≤ n < 1e6    → "X mil" ou "X,Y mil" com 1 casa decimal quando fracionária
 *                         (ex: 6000 → "6 mil", 12500 → "12,5 mil", 99999 → "99,9 mil")
 *  - n ≥ 1_000_000      → "X milhão" (1) ou "X,Y milhão/milhões"
 *                         (ex: 1_500_000 → "1,5 milhão", 2_500_000 → "2,5 milhões")
 *
 * Nulos / não-finitos / ≤ 0 retornam null.
 */
export function formatSalesLabel(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;

  if (n < 1000) {
    return String(Math.floor(n));
  }

  if (n < 1_000_000) {
    const mil = Math.floor((n / 1000) * 10) / 10; // trunca em 1 casa
    const text = Number.isInteger(mil)
      ? String(mil)
      : mil.toFixed(1).replace(".", ",");
    return `${text} mil`;
  }

  const mi = Math.floor((n / 1_000_000) * 10) / 10;
  const text = Number.isInteger(mi)
    ? String(mi)
    : mi.toFixed(1).replace(".", ",");
  // Plural: exatamente 1 → "milhão"; qualquer outro (incluindo 1,5) → "milhões"
  const unit = mi === 1 ? "milhão" : "milhões";
  return `${text} ${unit}`;
}
