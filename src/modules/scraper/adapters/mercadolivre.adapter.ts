import { BaseAdapter, type AdapterContext } from "./base.adapter";
import type { Marketplace, ProductPayload } from "../contracts/product.schema";
import { ScrapeError } from "../resilience/http-client";

/**
 * Mercado Livre expõe a API pública https://api.mercadolibre.com/items/{id}
 * — usá-la sempre que possível. Sem chave necessária para produtos públicos.
 */
export class MercadoLivreAdapter extends BaseAdapter {
  readonly marketplace: Marketplace = "mercadolivre";

  async extract(url: string, ctx: AdapterContext): Promise<ProductPayload> {
    const itemId = this.parseItemId(url);
    if (!itemId) throw new ScrapeError("parse_error", "MLB id não encontrado");

    const { body, status } = await ctx.http.get(`https://api.mercadolibre.com/items/${itemId}`);
    if (status === 404) throw new ScrapeError("not_found", "Item ML inexistente");
    const item = JSON.parse(body) as MlItem;

    return {
      marketplace: "mercadolivre",
      externalId: itemId,
      canonicalUrl: item.permalink,
      sourceUrl: url,
      title: item.title,
      brand: item.attributes?.find((a) => a.id === "BRAND")?.value_name,
      category: { path: [item.category_id], id: item.category_id },
      price: { amount: Math.round((item.original_price ?? item.price) * 100), currency: item.currency_id },
      salePrice:
        item.original_price && item.original_price > item.price
          ? { amount: Math.round(item.price * 100), currency: item.currency_id }
          : undefined,
      images: item.pictures.map((p, i) => ({ url: p.secure_url, isPrimary: i === 0 })),
      seller: item.seller_id
        ? { id: String(item.seller_id), name: `seller_${item.seller_id}`, officialStore: false }
        : undefined,
      availability: item.available_quantity > 0 ? "in_stock" : "out_of_stock",
      scrapedAt: new Date().toISOString(),
      extractionStrategy: "api",
    };
  }

  private parseItemId(url: string): string | null {
    return url.match(/MLB-?(\d+)/i)?.[0]?.replace("-", "") ?? null;
  }
}

interface MlItem {
  permalink: string;
  title: string;
  category_id: string;
  price: number;
  original_price?: number;
  currency_id: string;
  available_quantity: number;
  pictures: Array<{ secure_url: string }>;
  seller_id?: number;
  attributes?: Array<{ id: string; value_name?: string }>;
}
