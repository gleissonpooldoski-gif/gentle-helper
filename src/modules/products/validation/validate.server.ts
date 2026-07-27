/**
 * Validação de disponibilidade de produtos (foco Shopee).
 * Estratégia leve: HEAD/GET no link de afiliado e na imagem para inferir
 * se o anúncio ainda existe e se a imagem ainda é servida pelo CDN.
 *
 * Retorna um dos status persistidos em `products.availability`:
 * - active        : link responde 2xx/3xx e imagem OK.
 * - inactive      : link 404/410 ou redireciona para home/erro.
 * - out_of_stock  : página existe mas indica indisponível (Shopee "sold_out").
 * - error         : falha temporária (rede/timeout) — não remove permanentemente.
 *
 * LOTE 26 — Proteção contra falso negativo:
 * A degradação (active → inactive/out_of_stock/error) só é persistida
 * após N falhas consecutivas. Enquanto o contador não atinge o limite,
 * o status atual é preservado — apenas `validation_error` e o contador
 * são atualizados. Sucesso zera o contador.
 */

export type ProductAvailability = "active" | "inactive" | "out_of_stock" | "error";

export interface ValidationResult {
  availability: ProductAvailability;
  imageUrl?: string | null;
  reason?: string;
}

/**
 * Nº de falhas consecutivas necessárias para degradar `availability`.
 * Ajuste conservador: evita que um blip de CDN esconda o produto.
 */
export const DEGRADATION_FAILURE_THRESHOLD = 3;

const UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "user-agent": UA,
        accept: "*/*",
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(t);
  }
}

async function validateImage(url: string | null | undefined): Promise<boolean> {
  if (!url) return false;
  try {
    const r = await fetchWithTimeout(url, { method: "HEAD" }, 6000);
    if (r.ok) return true;
    // alguns CDNs bloqueiam HEAD → tenta GET pequeno
    const r2 = await fetchWithTimeout(url, { method: "GET", headers: { range: "bytes=0-1024" } }, 6000);
    return r2.ok;
  } catch {
    return false;
  }
}

async function validateShopeeLink(link: string): Promise<{ status: ProductAvailability; reason?: string }> {
  try {
    const r = await fetchWithTimeout(link, { method: "GET" }, 9000);
    const finalUrl = r.url || link;
    if (r.status === 404 || r.status === 410) {
      return { status: "inactive", reason: `http ${r.status}` };
    }
    if (/shopee\.com\.br\/?($|\?)/i.test(finalUrl) || /not[-_]?found|error/i.test(finalUrl)) {
      return { status: "inactive", reason: "redirecionou p/ home/erro" };
    }
    if (!r.ok) {
      return { status: "error", reason: `http ${r.status}` };
    }
    const body = (await r.text()).slice(0, 200_000).toLowerCase();
    if (
      body.includes('"stock":0') ||
      body.includes("sold_out") ||
      body.includes("produto indisponível") ||
      body.includes("out of stock")
    ) {
      return { status: "out_of_stock", reason: "estoque zerado" };
    }
    if (body.includes("página não encontrada") || body.includes("page not found")) {
      return { status: "inactive", reason: "página não encontrada" };
    }
    return { status: "active" };
  } catch (e) {
    return { status: "error", reason: e instanceof Error ? e.message : String(e) };
  }
}

async function validateGenericLink(link: string): Promise<{ status: ProductAvailability; reason?: string }> {
  try {
    const r = await fetchWithTimeout(link, { method: "HEAD" }, 8000);
    if (r.status === 404 || r.status === 410) return { status: "inactive", reason: `http ${r.status}` };
    if (r.ok) return { status: "active" };
    const r2 = await fetchWithTimeout(link, { method: "GET" }, 8000);
    if (r2.status === 404 || r2.status === 410) return { status: "inactive", reason: `http ${r2.status}` };
    if (r2.ok) return { status: "active" };
    return { status: "error", reason: `http ${r2.status}` };
  } catch (e) {
    return { status: "error", reason: e instanceof Error ? e.message : String(e) };
  }
}

export async function validateProduct(product: {
  platform?: string | null;
  affiliate_link?: string | null;
  raw_link?: string | null;
  image_url?: string | null;
}): Promise<ValidationResult> {
  const link = product.affiliate_link || product.raw_link;
  if (!link) return { availability: "inactive", reason: "sem link" };

  const isShopee = String(product.platform || "").toLowerCase() === "shopee" || /shopee/i.test(link);
  const linkResult = isShopee ? await validateShopeeLink(link) : await validateGenericLink(link);

  if (linkResult.status !== "active") {
    return { availability: linkResult.status, reason: linkResult.reason };
  }

  const imgOk = await validateImage(product.image_url);
  if (!imgOk) return { availability: "inactive", reason: "imagem indisponível" };

  return { availability: "active" };
}

export type ValidationOrigin = "cron" | "automation-tick" | "manual";

/**
 * Log estruturado single-line consumido pelos hooks de observabilidade.
 * Mantido em console.log para atravessar o worker sem dependências extras.
 */
function logAvailabilityChanged(payload: {
  product_id: string;
  channel_id: string;
  previous: string | null;
  next: ProductAvailability;
  reason: string | null;
  origin: ValidationOrigin;
  failure_count: number;
  degraded: boolean;
}) {
  try {
    console.log(
      `[PRODUCT_AVAILABILITY_CHANGED] ${JSON.stringify({
        ...payload,
        at: new Date().toISOString(),
      })}`,
    );
  } catch {
    /* no-op — logging never breaks the flow */
  }
}

/**
 * Persiste o resultado de uma validação no banco com proteção
 * anti-falso-negativo:
 *  - Sucesso ⇒ availability='active', failure_count=0.
 *  - Falha & availability atual != 'active' ⇒ apenas registra motivo/contador.
 *  - Falha & availability='active' ⇒ incrementa contador; só troca
 *    availability quando o contador atinge DEGRADATION_FAILURE_THRESHOLD.
 *
 * Emite PRODUCT_AVAILABILITY_CHANGED em qualquer transição real de status.
 */
export async function persistValidation(
  admin: any,
  productId: string,
  channelId: string,
  result: ValidationResult,
  origin: ValidationOrigin = "cron",
): Promise<void> {
  // Snapshot atual para decidir se degrada e para logar transição.
  const { data: current } = await admin
    .from("products")
    .select("availability, validation_failure_count")
    .eq("id", productId)
    .eq("channel_id", channelId)
    .maybeSingle();

  const previous = (current?.availability as string | null) ?? null;
  const prevCount = Number(current?.validation_failure_count ?? 0);
  const nowIso = new Date().toISOString();

  if (result.availability === "active") {
    await admin
      .from("products")
      .update({
        availability: "active",
        last_validated_at: nowIso,
        validation_error: null,
        validation_failure_count: 0,
      })
      .eq("id", productId)
      .eq("channel_id", channelId);

    if (previous && previous !== "active") {
      logAvailabilityChanged({
        product_id: productId,
        channel_id: channelId,
        previous,
        next: "active",
        reason: result.reason ?? null,
        origin,
        failure_count: 0,
        degraded: false,
      });
    }
    return;
  }

  // Falha. Decide se degrada agora ou apenas contabiliza.
  const nextCount = prevCount + 1;
  const shouldDegrade = nextCount >= DEGRADATION_FAILURE_THRESHOLD;
  const nextAvailability: ProductAvailability = shouldDegrade
    ? result.availability
    : (previous as ProductAvailability | null) ?? "active";

  await admin
    .from("products")
    .update({
      availability: nextAvailability,
      last_validated_at: nowIso,
      validation_error: result.reason ?? null,
      validation_failure_count: nextCount,
    })
    .eq("id", productId)
    .eq("channel_id", channelId);

  if (previous !== nextAvailability) {
    logAvailabilityChanged({
      product_id: productId,
      channel_id: channelId,
      previous,
      next: nextAvailability,
      reason: result.reason ?? null,
      origin,
      failure_count: nextCount,
      degraded: shouldDegrade,
    });
  }
}
