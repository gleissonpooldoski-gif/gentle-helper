import { BaseAdapter, type AdapterContext } from "./base.adapter";
import type { Marketplace, ProductPayload } from "../contracts/product.schema";
import { ScrapeError } from "../resilience/http-client";

/**
 * AliExpress bloqueia agressivamente scrapers. Estratégia:
 *   1. Endpoint mobile (m.aliexpress.com) que retorna HTML mais simples
 *   2. Fallback headless obrigatório para páginas dinâmicas
 *   3. Em produção: usar a Dropshipping API oficial via conta de afiliado.
 */
export class AliExpressAdapter extends BaseAdapter {
  readonly marketplace: Marketplace = "aliexpress";

  async extract(url: string, ctx: AdapterContext): Promise<ProductPayload> {
    const productId = url.match(/item\/(\d+)\.html/)?.[1];
    if (!productId) throw new ScrapeError("parse_error", "AliExpress productId ausente");

    const headless = await ctx.getHeadless();
    const html = await headless.render(`https://pt.aliexpress.com/item/${productId}.html`, {
      waitFor: '[data-pl="product-title"]',
      timeoutMs: 25_000,
    });

    // Parsing detalhado (JSON embutido em `window.runParams`) — omitido no boilerplate.
    if (!html.includes("runParams")) throw new ScrapeError("parse_error", "runParams ausente");

    return {
      marketplace: "aliexpress",
      externalId: productId,
      canonicalUrl: `https://pt.aliexpress.com/item/${productId}.html`,
      sourceUrl: url,
      title: "TODO",
      category: { path: ["AliExpress"] },
      price: { amount: 0, currency: "BRL" },
      images: [{ url: "https://placeholder", isPrimary: true }],
      availability: "unknown",
      scrapedAt: new Date().toISOString(),
      extractionStrategy: "headless",
    };
  }
}
