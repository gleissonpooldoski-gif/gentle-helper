import { BaseAdapter, type AdapterContext } from "./base.adapter";
import type { Marketplace, ProductPayload } from "../contracts/product.schema";
import { ScrapeError } from "../resilience/http-client";

/**
 * AliExpress: integração ainda NÃO suportada.
 *
 * Em vez de gravar produtos com dados fake (título "TODO", preço 0),
 * bloqueamos a importação com mensagem clara. Quando a Dropshipping API
 * oficial via conta de afiliado estiver disponível, este adapter deve
 * ser substituído pela integração oficial.
 */
export class AliExpressAdapter extends BaseAdapter {
  readonly marketplace: Marketplace = "aliexpress";

  async extract(_url: string, _ctx: AdapterContext): Promise<ProductPayload> {
    throw new ScrapeError(
      "unsupported_marketplace",
      "Importação AliExpress ainda não suportada. Use Shopee ou Mercado Livre por enquanto.",
    );
  }
}
