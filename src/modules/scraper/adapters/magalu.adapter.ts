import { BaseAdapter, type AdapterContext } from "./base.adapter";
import type { Marketplace, ProductPayload } from "../contracts/product.schema";
import { ScrapeError } from "../resilience/http-client";

/**
 * Magalu: as páginas de produto embutem um JSON-LD do tipo Product e um
 * bloco __NEXT_DATA__ com o payload completo. Estratégia: HTML + regex/JSON-LD.
 */
export class MagaluAdapter extends BaseAdapter {
  readonly marketplace: Marketplace = "magalu";

  async extract(url: string, ctx: AdapterContext): Promise<ProductPayload> {
    const { body } = await ctx.http.get(url);
    const nextData = body.match(/__NEXT_DATA__[^>]*>([^<]+)</)?.[1];
    if (!nextData) throw new ScrapeError("parse_error", "__NEXT_DATA__ ausente");

    const json = JSON.parse(nextData) as MagaluNextData;
    const product = json?.props?.pageProps?.product;
    if (!product) throw new ScrapeError("parse_error", "product ausente");

    return {
      marketplace: "magalu",
      externalId: product.variantId ?? product.id,
      canonicalUrl: product.url,
      sourceUrl: url,
      title: product.title,
      description: product.description,
      brand: product.brand,
      category: { path: product.category?.breadcrumb ?? [product.category?.name ?? "Magalu"] },
      price: { amount: Math.round((product.price?.bestPrice ?? 0) * 100), currency: "BRL" },
      salePrice:
        product.price?.sellPrice && product.price.sellPrice < product.price.bestPrice
          ? { amount: Math.round(product.price.sellPrice * 100), currency: "BRL" }
          : undefined,
      images: (product.media?.images ?? []).map((img, i) => ({ url: img.url, isPrimary: i === 0 })),
      seller: product.seller
        ? { id: product.seller.id, name: product.seller.description, officialStore: false }
        : undefined,
      rating: product.rating?.score,
      reviewsCount: product.rating?.count,
      availability: product.available ? "in_stock" : "out_of_stock",
      scrapedAt: new Date().toISOString(),
      extractionStrategy: "http",
    };
  }
}

interface MagaluNextData {
  props?: {
    pageProps?: {
      product?: {
        id: string;
        variantId?: string;
        url: string;
        title: string;
        description?: string;
        brand?: string;
        available?: boolean;
        category?: { name?: string; breadcrumb?: string[] };
        price?: { bestPrice: number; sellPrice?: number };
        media?: { images?: Array<{ url: string }> };
        seller?: { id: string; description: string };
        rating?: { score: number; count: number };
      };
    };
  };
}
