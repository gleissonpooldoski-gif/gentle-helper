import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { apiClient } from "@/lib/api-client";
import { DEFAULT_POST_LAYOUT, type PostLayout } from "./render";

function normalize(row: any | null | undefined): PostLayout {
  if (!row) return DEFAULT_POST_LAYOUT;
  return {
    header: row.header ?? DEFAULT_POST_LAYOUT.header,
    header_mode: row.header_mode === "auto" ? "auto" : "custom",
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

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

async function loadRow(supabase: any, userId: string, channelId: string | null) {
  if (channelId) {
    const { data } = await supabase
      .from("post_layouts")
      .select("*")
      .eq("user_id", userId)
      .eq("channel_id", channelId)
      .maybeSingle();
    if (data) return data;
  }
  const { data } = await supabase
    .from("post_layouts")
    .select("*")
    .eq("user_id", userId)
    .is("channel_id", null)
    .maybeSingle();
  return data ?? null;
}

export const getPostLayout = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { channelId?: string | null } | undefined) => ({
    channelId: isUuid(data?.channelId) ? (data!.channelId as string) : null,
  }))
  .handler(async ({ data, context }): Promise<PostLayout> => {
    const { supabase, userId } = context;
    const row = await loadRow(supabase, userId, data.channelId);
    return normalize(row);
  });

export const savePostLayout = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: Partial<PostLayout> & { channelId?: string | null }) => {
    const clean: any = {};
    const { channelId, ...rest } = data ?? {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) clean[k] = v;
    }
    clean.channelId = isUuid(channelId) ? channelId : null;
    return clean;
  })
  .handler(async ({ data, context }): Promise<PostLayout> => {
    const { supabase, userId } = context;
    const { channelId, ...fields } = data as any;
    const payload = {
      user_id: userId,
      channel_id: channelId,
      ...fields,
      updated_at: new Date().toISOString(),
    };

    // Upsert manual porque o índice único é parcial (WHERE channel_id IS NULL / NOT NULL).
    const existing = await loadRow(supabase, userId, channelId);
    if (existing?.id) {
      const { data: row, error } = await (supabase as any)
        .from("post_layouts")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return normalize(row);
    }
    const { data: row, error } = await (supabase as any)
      .from("post_layouts")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return normalize(row);
  });

/** Uso interno server-side. Fallback: canal → padrão do usuário. */
export async function loadLayoutFor(
  supabase: any,
  userId: string,
  channelId?: string | null,
): Promise<PostLayout> {
  const row = await loadRow(supabase, userId, channelId ?? null);
  return normalize(row);
}
