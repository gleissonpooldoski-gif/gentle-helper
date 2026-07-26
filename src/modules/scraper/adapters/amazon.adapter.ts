import { BaseAdapter, type AdapterContext } from "./base.adapter";
import type { Marketplace, ProductPayload } from "../contracts/product.schema";
import { ScrapeError } from "../resilience/http-client";

/**
 * Amazon: integração ainda NÃO suportada.
 *
 * Em vez de gravar produtos com dados vazios (título ausente, preço 0),
 * bloqueamos a importação com uma mensagem clara. Quando a PA-API 5.0
 * estiver disponível, este adapter deve ser substituído pela integração
 * oficial (não por scraping — a Amazon bloqueia agressivamente).
 */
export class AmazonAdapter extends BaseAdapter {
  readonly marketplace: Marketplace = "amazon";

  async extract(_url: string, _ctx: AdapterContext): Promise<ProductPayload> {
    throw new ScrapeError(
      "unsupported_marketplace",
      "Importação Amazon ainda não suportada. Use Shopee ou Mercado Livre por enquanto.",
    );
  }
}
