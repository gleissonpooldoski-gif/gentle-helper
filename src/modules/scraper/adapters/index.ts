import type { Marketplace } from "../contracts/product.schema";
import type { BaseAdapter } from "./base.adapter";
import { ShopeeAdapter } from "./shopee.adapter";
import { AmazonAdapter } from "./amazon.adapter";
import { MercadoLivreAdapter } from "./mercadolivre.adapter";
import { MagaluAdapter } from "./magalu.adapter";
import { AliExpressAdapter } from "./aliexpress.adapter";

const REGISTRY: Record<Marketplace, BaseAdapter> = {
  shopee: new ShopeeAdapter(),
  amazon: new AmazonAdapter(),
  mercadolivre: new MercadoLivreAdapter(),
  magalu: new MagaluAdapter(),
  aliexpress: new AliExpressAdapter(),
};

export function getAdapter(marketplace: Marketplace): BaseAdapter {
  return REGISTRY[marketplace];
}
