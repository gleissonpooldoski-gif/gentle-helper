import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { apiClient } from "@/lib/api-client";

export interface ChannelProductDTO {
  id: string;
  channelId: string;
  platform: string;
  itemId: string | null;
  title: string;
  imageUrl: string | null;
  rawLink: string;
  affiliateLink: string;
  originalPrice: number | null;
  promoPrice: number | null;
  commissionRate: number | null;
  sales: number | null;
  availability: string;
  createdAt: string;
  sentCount: number;
}


const ListSchema = z.object({
  channelId: z.string().uuid(),
  platform: z.enum(["shopee", "mercadolivre"]),
});

export const listChannelProducts = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((input: unknown) => ListSchema.parse(input))
  .handler(async ({ data, context }): Promise<ChannelProductDTO[]> => {
    // Pagina em blocos de 1000 para ultrapassar o limite padrão do PostgREST
    // e suportar canais com dezenas de milhares de produtos.
    const pageSize = 1000;
    const rows: any[] = [];
    for (let i = 0; i < 100; i++) {
      const from = i * pageSize;
      const { data: batch, error } = await context.supabase
        .from("products")
        .select(
          "id,channel_id,platform,item_id,title,image_url,raw_link,affiliate_link,original_price,promo_price,commission_rate,sales,availability,created_at",
        )
        .eq("user_id", context.userId)
        .eq("channel_id", data.channelId)
        .eq("platform", data.platform)
        .eq("availability", "active")
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      const b = batch ?? [];
      rows.push(...b);
      if (b.length < pageSize) break;
    }
    // Conta envios já realizados por produto (histórico de campanhas WhatsApp).
    const sentByProduct = new Map<string, number>();
    for (let i = 0; i < 20; i++) {
      const from = i * pageSize;
      const { data: batch, error } = await context.supabase
        .from("whatsapp_campaign_history")
        .select("product_id")
        .eq("user_id", context.userId)
        .not("product_id", "is", null)
        .range(from, from + pageSize - 1);
      if (error) break;
      const b = (batch ?? []) as { product_id: string | null }[];
      for (const h of b) {
        if (!h.product_id) continue;
        sentByProduct.set(h.product_id, (sentByProduct.get(h.product_id) ?? 0) + 1);
      }
      if (b.length < pageSize) break;
    }

    return (rows ?? []).map((row) => ({
      id: row.id,
      channelId: row.channel_id ?? data.channelId,
      platform: row.platform,
      itemId: row.item_id ?? null,
      title: row.title ?? "",
      imageUrl: row.image_url ?? null,
      rawLink: row.raw_link ?? "",
      affiliateLink: row.affiliate_link ?? "",
      originalPrice: row.original_price == null ? null : Number(row.original_price),
      promoPrice: row.promo_price == null ? null : Number(row.promo_price),
      commissionRate: row.commission_rate == null ? null : Number(row.commission_rate),
      sales: row.sales == null ? null : Number(row.sales),
      availability: row.availability ?? "unknown",
      createdAt: row.created_at,
      sentCount: sentByProduct.get(row.id) ?? 0,
    }));
  });
