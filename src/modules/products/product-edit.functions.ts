/**
 * Server functions to load and update a single product for the "Editar" modal.
 * Scoped to the authenticated user (RLS also enforces).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { apiClient } from "@/lib/api-client";

export interface EditableProductDTO {
  id: string;
  platform: string;
  item_id: string | null;
  title: string;
  image_url: string | null;
  raw_link: string;
  affiliate_link: string;
  original_price: number | null;
  promo_price: number | null;
  category: string | null;
  availability: string;
  created_at: string;
  linkedGroups: string[];
}

const GetSchema = z
  .object({
    channelId: z.string().uuid(),
    id: z.string().uuid().optional(),
    platform: z.string().min(1).optional(),
    itemId: z.string().min(1).optional(),
  })
  .refine((v) => !!v.id || (!!v.platform && !!v.itemId), {
    message: "Informe id ou (platform + itemId).",
  });

export const getProductForEdit = createServerFn({ method: "GET" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((input: unknown) => GetSchema.parse(input))
  .handler(async ({ data, context }): Promise<EditableProductDTO | null> => {
    let q = context.supabase
      .from("products")
      .select("*")
      .eq("user_id", context.userId)
      .eq("channel_id", data.channelId)
      .limit(1);
    if (data.id) q = q.eq("id", data.id);
    else q = q.eq("platform", data.platform!).eq("item_id", data.itemId!);

    const { data: row, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;

    const { data: configs } = await context.supabase
      .from("automation_configs")
      .select("group_name, lojas_ativas")
      .eq("user_id", context.userId);

    const platform = String(row.platform ?? "").toLowerCase();
    const groups = new Set<string>();
    for (const c of configs ?? []) {
      const lojas = (c.lojas_ativas ?? []).map((s: string) => String(s).toLowerCase());
      if (lojas.includes(platform) && c.group_name) groups.add(c.group_name);
    }

    return {
      id: row.id,
      platform: row.platform,
      item_id: row.item_id ?? null,
      title: row.title ?? "",
      image_url: row.image_url ?? null,
      raw_link: row.raw_link ?? "",
      affiliate_link: row.affiliate_link ?? "",
      original_price: row.original_price != null ? Number(row.original_price) : null,
      promo_price: row.promo_price != null ? Number(row.promo_price) : null,
      category: row.category ?? null,
      availability: row.availability ?? "unknown",
      created_at: row.created_at,
      linkedGroups: Array.from(groups),
    };
  });

const UpdateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(500),
  image_url: z.string().url().nullable().optional(),
  raw_link: z.string().url(),
  affiliate_link: z.string().url(),
  original_price: z.number().nonnegative().nullable().optional(),
  promo_price: z.number().nonnegative().nullable().optional(),
  category: z.string().max(200).nullable().optional(),
  availability: z.enum(["active", "inactive", "out_of_stock", "error", "unknown"]).optional(),
});

export const updateProduct = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateSchema.parse(input))
  .handler(async ({ data, context }): Promise<EditableProductDTO> => {
    const { id, ...updates } = data;
    const patch = {
      ...updates,
      image_url: updates.image_url ?? null,
      updated_at: new Date().toISOString(),
    };
    const { data: row, error } = await context.supabase
      .from("products")
      .update(patch as never)
      .eq("id", id)
      .eq("user_id", context.userId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Produto não encontrado.");

    return {
      id: row.id,
      platform: row.platform,
      item_id: row.item_id ?? null,
      title: row.title ?? "",
      image_url: row.image_url ?? null,
      raw_link: row.raw_link ?? "",
      affiliate_link: row.affiliate_link ?? "",
      original_price: row.original_price != null ? Number(row.original_price) : null,
      promo_price: row.promo_price != null ? Number(row.promo_price) : null,
      category: row.category ?? null,
      availability: row.availability ?? "unknown",
      created_at: row.created_at,
      linkedGroups: [],
    };
  });
