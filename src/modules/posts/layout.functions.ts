import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { apiClient } from "@/lib/api-client";
import { DEFAULT_POST_LAYOUT, type PostLayout } from "./render";

function normalize(row: any | null | undefined): PostLayout {
  if (!row) return DEFAULT_POST_LAYOUT;
  return {
    header: row.header ?? DEFAULT_POST_LAYOUT.header,
    title_template: row.title_template ?? DEFAULT_POST_LAYOUT.title_template,
    upper_title: row.upper_title ?? DEFAULT_POST_LAYOUT.upper_title,
    hide_sales: row.hide_sales ?? DEFAULT_POST_LAYOUT.hide_sales,
    sales_template: row.sales_template ?? DEFAULT_POST_LAYOUT.sales_template,
    description_template: row.description_template ?? DEFAULT_POST_LAYOUT.description_template,
    hide_original: row.hide_original ?? DEFAULT_POST_LAYOUT.hide_original,
    original_price_template:
      row.original_price_template ?? DEFAULT_POST_LAYOUT.original_price_template,
    installment_template: row.installment_template ?? DEFAULT_POST_LAYOUT.installment_template,
    price_template: row.price_template ?? DEFAULT_POST_LAYOUT.price_template,
    link_template: row.link_template ?? DEFAULT_POST_LAYOUT.link_template,
    footer: row.footer ?? DEFAULT_POST_LAYOUT.footer,
  };
}

export const getPostLayout = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .handler(async ({ context }): Promise<PostLayout> => {
    const { supabase, userId } = context;
    const { data, error } = await (supabase as any)
      .from("post_layouts")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return normalize(data);
  });

export const savePostLayout = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: Partial<PostLayout>): Partial<PostLayout> => {
    const clean: any = {};
    for (const [k, v] of Object.entries(data ?? {})) {
      if (v !== undefined) clean[k] = v;
    }
    return clean;
  })
  .handler(async ({ data, context }): Promise<PostLayout> => {
    const { supabase, userId } = context;
    const payload = { user_id: userId, ...data, updated_at: new Date().toISOString() };
    const { data: row, error } = await (supabase as any)
      .from("post_layouts")
      .upsert(payload, { onConflict: "user_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return normalize(row);
  });

/** Uso interno server-side. */
export async function loadLayoutFor(
  supabase: any,
  userId: string,
): Promise<PostLayout> {
  const { data } = await supabase
    .from("post_layouts")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return normalize(data);
}
