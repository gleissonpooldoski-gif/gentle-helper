/**
 * Server functions for bulk deletion of products (escopado por grupo).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DeleteByItemsSchema = z.object({
  channelId: z.string().uuid(),
  platform: z.string().min(1),
  itemIds: z.array(z.string().min(1)).min(1).max(1000),
});

export const deleteProductsByItemIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteByItemsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error, count } = await context.supabase
      .from("products")
      .delete({ count: "exact" })
      .eq("user_id", context.userId)
      .eq("channel_id", data.channelId)
      .eq("platform", data.platform)
      .in("item_id", data.itemIds);
    if (error) throw new Error(error.message);
    return { deleted: count ?? 0 };
  });

const DeleteAllSchema = z.object({
  channelId: z.string().uuid(),
  platform: z.string().min(1),
});

export const deleteAllProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteAllSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error, count } = await context.supabase
      .from("products")
      .delete({ count: "exact" })
      .eq("user_id", context.userId)
      .eq("channel_id", data.channelId)
      .eq("platform", data.platform);
    if (error) throw new Error(error.message);
    return { deleted: count ?? 0 };
  });
