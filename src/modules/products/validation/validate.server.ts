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
 */

export type ProductAvailability = "active" | "inactive" | "out_of_stock" | "error";

export interface ValidationResult {
  availability: ProductAvailability;
  imageUrl?: string | null;
  reason?: string;
}

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
    // Redirecionamentos p/ home / not found
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
    // HEAD pode não ser suportado — tenta GET
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

/**
 * Persiste o resultado de uma validação no banco.
 */
export async function persistValidation(
  admin: any,
  productId: string,
  result: ValidationResult,
): Promise<void> {
  await admin
    .from("products")
    .update({
      availability: result.availability,
      last_validated_at: new Date().toISOString(),
      validation_error: result.reason ?? null,
    })
    .eq("id", productId);
}
