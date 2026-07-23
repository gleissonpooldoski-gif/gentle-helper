/**
 * Validators for Magalu affiliate configuration.
 * Pure, no I/O — safe to import anywhere.
 */

export type MagaluValidation = { ok: boolean; errors: string[] };

/**
 * Normaliza o nome da loja Magalu (usado como identificador do parceiro na URL).
 * - lowercase
 * - remove espaços em volta
 */
export function normalizeStoreName(input: string | null | undefined): string {
  return String(input ?? "").trim().toLowerCase();
}

/**
 * Regras aceitas para o "nome da loja" (ex.: `segredopromocoes`):
 * apenas letras minúsculas, números, `-`, `_` e `.`; 2–60 caracteres.
 */
export function validateStoreName(rawStoreName: string): MagaluValidation {
  const errors: string[] = [];
  const s = normalizeStoreName(rawStoreName);
  if (!s) errors.push("Informe o nome da loja Magalu.");
  else if (s.length < 2 || s.length > 60) errors.push("Nome da loja deve ter entre 2 e 60 caracteres.");
  else if (!/^[a-z0-9._-]+$/.test(s)) {
    errors.push("Use apenas letras minúsculas, números, '.', '_' e '-'.");
  }
  return { ok: errors.length === 0, errors };
}

export type MagaluStatus = "connected" | "pending" | "error";

export function computeStatus(storeName: string): { status: MagaluStatus; error: string | null } {
  if (!normalizeStoreName(storeName)) {
    return { status: "pending", error: "Configure seu nome de loja Magalu." };
  }
  return { status: "connected", error: null };
}
