import { BaseAdapter, type AdapterContext } from "./base.adapter";
import type { Marketplace, ProductPayload } from "../contracts/product.schema";
import { ScrapeError } from "../resilience/http-client";
import { stripTracking } from "../utils/url";

/**
 * Shopee expõe uma API interna JSON em /api/v4/pdp/get_pc?item_id=X&shop_id=Y.
 * É a rota preferida: rápida, estável, sem parsing de HTML.
 * Requer o header `x-api-source: pc` e cookies de sessão anônima que a
 * própria Shopee emite no primeiro GET à página do produto.
 */
export class ShopeeAdapter extends BaseAdapter {
  readonly marketplace: Marketplace = "shopee";

  async extract(url: string, ctx: AdapterContext): Promise<ProductPayload> {
    const ids = this.parseIds(url);
    if (!ids) throw new ScrapeError("parse_error", "Could not extract shopee ids from URL");

    const api = `https://shopee.com.br/api/v4/pdp/get_pc?item_id=${ids.itemId}&shop_id=${ids.shopId}`;
    const { status, body } = await ctx.http.get(api, {
      headers: { "x-api-source": "pc", referer: url },
    });
    if (status === 404) throw new ScrapeError("not_found", "Shopee item not found");

    const json = JSON.parse(body) as ShopeePdpResponse;
    const item = json?.data?.item;
    if (!item) throw new ScrapeError("parse_error", "Missing item in Shopee response");

    const price = Math.round(item.price / 1000); // Shopee retorna em micro-unidades * 100
    const priceBefore = Math.round((item.price_before_discount || item.price) / 1000);

    return {
      marketplace: "shopee",
      externalId: `${ids.shopId}.${ids.itemId}`,
      canonicalUrl: stripTracking(url),
      sourceUrl: url,
      title: item.title,
      description: item.description,
      brand: item.brand || undefined,
      category: { path: item.categories?.map((c) => c.display_name) ?? ["Sem categoria"] },
      price: { amount: priceBefore, currency: "BRL" },
      salePrice:
        priceBefore > price ? { amount: price, currency: "BRL" } : undefined,
      discountPercent: item.discount ? Number(String(item.discount).replace("%", "")) : undefined,
      images: item.images.map((hash, i) => ({
        url: `https://cf.shopee.com.br/file/${hash}`,
        isPrimary: i === 0,
      })),
      seller: item.shop
        ? { id: String(ids.shopId), name: item.shop.name, officialStore: false }
        : undefined,
      rating: item.item_rating?.rating_star,
      reviewsCount: item.item_rating?.rating_count?.[0],
      availability: item.stock > 0 ? "in_stock" : "out_of_stock",
      scrapedAt: new Date().toISOString(),
      extractionStrategy: "api",
      raw: { itemId: ids.itemId, shopId: ids.shopId },
    };
  }

  private parseIds(url: string): { itemId: string; shopId: string } | null {
    // Padrões: /product/{shopId}/{itemId} ou ...-i.{shopId}.{itemId}
    const m1 = url.match(/product\/(\d+)\/(\d+)/);
    if (m1) return { shopId: m1[1]!, itemId: m1[2]! };
    const m2 = url.match(/i\.(\d+)\.(\d+)/);
    if (m2) return { shopId: m2[1]!, itemId: m2[2]! };
    return null;
  }
}

interface ShopeePdpResponse {
  data?: {
    item?: {
      title: string;
      description?: string;
      brand?: string;
      price: number;
      price_before_discount: number;
      discount?: string;
      stock: number;
      images: string[];
      categories?: Array<{ display_name: string }>;
      shop?: { name: string };
      item_rating?: { rating_star: number; rating_count: number[] };
    };
  };
}
