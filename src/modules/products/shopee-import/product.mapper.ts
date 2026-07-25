/**
 * Maps a parsed Shopee CSV row into a `products` table upsert payload.
 * Offer Link is preserved untouched (already commissioned by Shopee).
 * Cada produto pertence a um `channel_id` (grupo) — isolamento por grupo.
 *
 * Regra de preço: o CSV da Shopee traz apenas UM preço (o vigente).
 * Ele é gravado em `promo_price` (preço atual). `original_price` fica
 * NULL — só é preenchido quando há evidência de queda de preço vinda
 * da captura WhatsApp/PDP. O render usa exatamente esses dois campos.
 *
 * Regra de vendas: `sales_label` é derivado do inteiro (ex: 6000 → "6 mil")
 * usando o utilitário compartilhado com a captura, para manter consistência.
 */
import type { ShopeeCsvRow } from "./csv.processor";
import { formatSalesLabel } from "@/modules/products/sales-label";

export type ShopeeProductUpsert = {
  user_id: string;
  channel_id: string | null;
  source_group_jid: string;
  source_group_name: string | null;
  platform: "shopee";
  item_id: string;
  title: string;
  store_name: string | null;
  original_price: number | null;
  promo_price: number | null;
  sales: number | null;
  sales_label: string | null;
  commission_rate: number | null;
  commission_value: number | null;
  raw_link: string;
  affiliate_link: string;
  image_url: string | null;
};

export function mapRowToProduct(
  userId: string,
  channelId: string | null,
  sourceGroupJid: string,
  sourceGroupName: string | null,
  row: ShopeeCsvRow,
): ShopeeProductUpsert {
  return {
    user_id: userId,
    channel_id: channelId,
    source_group_jid: sourceGroupJid,
    source_group_name: sourceGroupName,
    platform: "shopee",
    item_id: row.itemId,
    title: row.itemName,
    store_name: row.storeName || null,
    original_price: null,
    promo_price: row.price,
    sales: row.sales,
    sales_label: formatSalesLabel(row.sales),
    commission_rate: row.commissionRate,
    commission_value: row.commissionValue,
    raw_link: row.productUrl,
    affiliate_link: row.offerUrl,
    image_url: row.imageUrl,
  };
}

