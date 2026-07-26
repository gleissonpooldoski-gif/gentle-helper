/**
 * Fonte ÚNICA para converter valores brutos de "vendas" (CSV Shopee, texto de PDP,
 * mensagens, número puro) em inteiro absoluto.
 *
 * Trata sufixos textuais que a Shopee usa no display:
 *  - "mil" / "k"  → x1_000
 *  - "milhão" / "milhões" / "mi" / "m" (isolado) → x1_000_000
 *
 * E preserva separadores BR/EN:
 *  - "6.000"  → 6000  (ponto como milhar)
 *  - "6,000"  → 6000  (vírgula como milhar quando seguida de 3 dígitos)
 *  - "6,5 mil" → 6500 (vírgula como decimal com sufixo)
 *  - "1.5k"    → 1500
 *
 * Retorna null para vazio, inválido ou <= 0.
 */
export function normalizeSales(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") {
    return Number.isFinite(v) && v > 0 ? Math.trunc(v) : null;
  }
  const raw = String(v).trim().toLowerCase();
  if (!raw) return null;

  // Detecta multiplicador textual antes de remover letras.
  let multiplier = 1;
  if (/\b(milh(ão|oes|ões)|mi|m)\b/.test(raw) && !/mil\b/.test(raw)) {
    multiplier = 1_000_000;
  } else if (/(mil\b|\dk\b|\dk$|\d\s*k\b)/.test(raw)) {
    multiplier = 1_000;
  }

  // Extrai o token numérico principal (aceita "6,5" ou "6.5" ou "6.000" ou "6,000").
  const match = raw.match(/-?\d[\d.,]*/);
  if (!match) return null;
  let numStr = match[0];

  // Se há vírgula E ponto, assume ponto=milhar, vírgula=decimal.
  const hasComma = numStr.includes(",");
  const hasDot = numStr.includes(".");
  if (hasComma && hasDot) {
    numStr = numStr.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // Vírgula sozinha: milhar se seguida de exatamente 3 dígitos até o fim; senão decimal.
    if (/^\d{1,3}(,\d{3})+$/.test(numStr)) {
      numStr = numStr.replace(/,/g, "");
    } else {
      numStr = numStr.replace(",", ".");
    }
  } else if (hasDot) {
    // Ponto sozinho: milhar se todos os grupos têm 3 dígitos; senão decimal.
    if (/^\d{1,3}(\.\d{3})+$/.test(numStr)) {
      numStr = numStr.replace(/\./g, "");
    }
  }

  const n = Number(numStr);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n * multiplier);
}
