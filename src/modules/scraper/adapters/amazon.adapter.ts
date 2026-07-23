import { BaseAdapter, type AdapterContext } from "./base.adapter";
import type { Marketplace, ProductPayload } from "../contracts/product.schema";
import { ScrapeError } from "../resilience/http-client";
import { stripTracking } from "../utils/url";

/**
 * Amazon: em produção, preferir a **PA-API 5.0** (Product Advertising API) via
 * conta de afiliado — payload confiável e legal. Este adapter mostra o fallback
 * HTML + headless caso a PA-API não esteja disponível.
 */
export class AmazonAdapter extends BaseAdapter {
  readonly marketplace: Marketplace = "amazon";

  async extract(url: string, ctx: AdapterContext): Promise<ProductPayload> {
    const asin = this.parseAsin(url);
    if (!asin) throw new ScrapeError("parse_error", "ASIN não encontrado na URL");

    // Camada 1: HTML estático
    let html: string;
    let strategy: ProductPayload["extractionStrategy"] = "http";
    try {
      const res = await ctx.http.get(`https://www.amazon.com.br/dp/${asin}`);
      html = res.body;
      if (html.includes("captcha") || html.length < 5_000) throw new Error("captcha_or_thin");
    } catch {
      // Camada 2: headless
      strategy = "headless";
      const headless = await ctx.getHeadless();
      html = await headless.render(`https://www.amazon.com.br/dp/${asin}`, {
        waitFor: "#productTitle",
      });
    }

    const parsed = this.parseHtml(html);
    if (!parsed.title) throw new ScrapeError("parse_error", "Título ausente");

    return {
      marketplace: "amazon",
      externalId: asin,
      canonicalUrl: `https://www.amazon.com.br/dp/${asin}`,
      sourceUrl: stripTracking(url),
      title: parsed.title,
      description: parsed.description,
      brand: parsed.brand,
      category: { path: parsed.breadcrumbs ?? ["Amazon"] },
      price: { amount: parsed.price ?? 0, currency: "BRL" },
      salePrice: parsed.salePrice ? { amount: parsed.salePrice, currency: "BRL" } : undefined,
      images: parsed.images.map((u, i) => ({ url: u, isPrimary: i === 0 })),
      rating: parsed.rating,
      reviewsCount: parsed.reviewsCount,
      availability: parsed.inStock ? "in_stock" : "unknown",
      scrapedAt: new Date().toISOString(),
      extractionStrategy: strategy,
    };
  }

  private parseAsin(url: string): string | null {
    return url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1] ?? null;
  }

  /** Parsing real deve usar Cheerio; deixado como stub focado na arquitetura. */
  private parseHtml(_html: string): {
    title?: string;
    description?: string;
    brand?: string;
    breadcrumbs?: string[];
    price?: number;
    salePrice?: number;
    images: string[];
    rating?: number;
    reviewsCount?: number;
    inStock?: boolean;
  } {
    // TODO(impl): cheerio.load(_html) → seletores #productTitle, .a-price, #landingImage, etc.
    return { images: [] };
  }
}
