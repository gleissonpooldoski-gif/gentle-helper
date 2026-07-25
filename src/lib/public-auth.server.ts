/**
 * Helpers de autenticação para rotas em /api/public/*.
 * - requireCronSecret: valida x-cron-secret ou Authorization: Bearer <CRON_SECRET>.
 * - verifyMetaSignature: valida assinatura HMAC-SHA256 do Meta (x-hub-signature-256).
 * - verifyEvolutionApiKey: valida apikey global da Evolution API (opcional).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function requireCronSecret(request: Request): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return Response.json({ ok: false, error: "CRON_SECRET não configurado" }, { status: 500 });
  }
  const provided =
    request.headers.get("x-cron-secret") ??
    (request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  if (!provided || !timingSafeEqualStr(provided, expected)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret || !signatureHeader) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyEvolutionApiKey(request: Request): boolean {
  const expected = process.env.EVOLUTION_API_KEY;
  if (!expected) return true; // permissivo se não configurado (dev)
  const provided = request.headers.get("apikey") ?? request.headers.get("x-api-key") ?? "";
  return !!provided && timingSafeEqualStr(provided, expected);
}
