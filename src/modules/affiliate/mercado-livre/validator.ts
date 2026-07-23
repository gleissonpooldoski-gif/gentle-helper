/**
 * Validators and pure helpers for Mercado Livre affiliate config.
 * No I/O — safe to import anywhere.
 */

export type MLValidation = {
  ok: boolean;
  errors: string[];
};

export function validateAffiliateInput(input: {
  affiliateLink: string;
  cookie?: string | null;
}): MLValidation {
  const errors: string[] = [];
  const link = (input.affiliateLink ?? "").trim();
  if (!link) errors.push("Informe o link de afiliado do Mercado Livre.");
  if (link.length > 2000) errors.push("Link muito longo.");
  if (link && !/mercadoli(vre|bre)|mercadolibre|mercadolivre|\/sec\//i.test(link)) {
    errors.push("Link não parece ser do Mercado Livre.");
  }
  if (input.cookie && input.cookie.length > 8000) errors.push("Cookie muito longo.");
  return { ok: errors.length === 0, errors };
}

/**
 * Extract the affiliate tag from a Mercado Livre URL. Tries multiple
 * known parameter names before falling back to a path-based match.
 */
export function extractAffiliateTag(link: string): string | null {
  if (!link) return null;
  const candidates = [
    "matt_word",
    "matt_tool",
    "tracking_id",
    "tc",
    "aff",
    "aff_id",
    "affiliate_id",
    "matt_camp",
    "matt_source",
  ];
  try {
    const url = new URL(link);
    for (const key of candidates) {
      const v = url.searchParams.get(key);
      if (v && v.trim().length > 0) return v.trim();
    }
    // Path-based tag e.g. /sec/<code> or /social/<code>
    const m = url.pathname.match(/\/(?:sec|social|share|s)\/([A-Za-z0-9_-]{4,})/i);
    if (m) return m[1];
  } catch {
    // Non-URL fallback
    const m = link.match(/(?:matt_word|tracking_id|tc)=([A-Za-z0-9_-]+)/i);
    if (m) return m[1];
  }
  return null;
}

export type ConnectionStatus = "connected" | "pending" | "error" | "cookie_expired";

export function computeStatus(input: {
  affiliateLink: string;
  cookie?: string | null;
  tag?: string | null;
}): { status: ConnectionStatus; error: string | null } {
  if (!input.affiliateLink?.trim()) return { status: "pending", error: "Link de afiliado ausente." };
  if (!input.tag) {
    return {
      status: "pending",
      error: "Não foi possível identificar a tag de afiliado — configure manualmente.",
    };
  }
  // Cookie is optional; a valid affiliate tag is enough to save and use the connection.
  return { status: "connected", error: null };
}
