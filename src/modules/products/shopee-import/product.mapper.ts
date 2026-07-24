/**
 * Maps a parsed Shopee CSV row into a `products` table upsert payload.
 * Offer Link is preserved untouched (already commissioned by Shopee).
 * Cada produto pertence a um `channel_id` (grupo) — isolamento por grupo.
 */
import type { ShopeeCsvRow } from "./csv.processor";

export type ShopeeProductUpsert = {
  user_id: string;
  channel_id: string | null;
  platform: "shopee";
  item_id: string;
  title: string;
  store_name: string | null;
  original_price: number | null;
  promo_price: number | null;
  sales: number | null;
  commission_rate: number | null;
  commission_value: number | null;
  raw_link: string;
  affiliate_link: string;
  image_url: string | null;
};

export function mapRowToProduct(
  userId: string,
  channelId: string | null,
  row: ShopeeCsvRow,
): ShopeeProductUpsert {
  return {
    user_id: userId,
    channel_id: channelId,
    platform: "shopee",
    item_id: row.itemId,
    title: row.itemName,
    store_name: row.storeName || null,
    original_price: row.price,
    promo_price: null,
    sales: row.sales,
    commission_rate: row.commissionRate,
    commission_value: row.commissionValue,
    raw_link: row.productUrl,
    affiliate_link: row.offerUrl,
    image_url: row.imageUrl,
  };
}
