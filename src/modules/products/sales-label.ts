/**
 * Humaniza a contagem de vendas no padrão que a Shopee exibe:
 * 30 → "30", 300 → "300", 1500 → "1,5 mil", 30000 → "30 mil".
 * Fonte única usada tanto na captura (WhatsApp/PDP) quanto na
 * importação em massa (CSV Shopee) para manter `sales_label`
 * consistente no banco.
 */
export function formatSalesLabel(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  if (n < 1000) {
    const rounded = n >= 100 ? Math.floor(n / 100) * 100 : Math.floor(n / 10) * 10;
    return `${Math.max(rounded, 10)}`;
  }
  const mil = n / 1000;
  if (mil < 10) {
    const rounded = Math.floor(mil * 10) / 10;
    const text = Number.isInteger(rounded)
      ? String(rounded)
      : rounded.toFixed(1).replace(".", ",");
    return `${text} mil`;
  }
  const rounded = Math.floor(mil / 10) * 10 || Math.floor(mil);
  return `${rounded} mil`;
}
