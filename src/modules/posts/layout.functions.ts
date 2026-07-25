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

/* ==================== Header Variations ==================== */

export interface HeaderVariation {
  id: string;
  user_id: string | null;
  text: string;
  active: boolean;
}

export const listHeaderVariations = createServerFn({ method: "GET" })
  .middleware([apiClient, requireSupabaseAuth])
  .handler(async ({ context }): Promise<HeaderVariation[]> => {
    const { supabase } = context;
    const { data, error } = await (supabase as any)
      .from("post_header_variations")
      .select("id, user_id, text, active")
      .order("user_id", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as HeaderVariation[];
  });

export const addHeaderVariation = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { text: string }) => ({
    text: String(data?.text ?? "").trim(),
  }))
  .handler(async ({ data, context }): Promise<HeaderVariation> => {
    if (!data.text) throw new Error("Texto obrigatório");
    const { supabase, userId } = context;
    const { data: row, error } = await (supabase as any)
      .from("post_header_variations")
      .insert({ user_id: userId, text: data.text, active: true })
      .select("id, user_id, text, active")
      .single();
    if (error) throw new Error(error.message);
    return row as HeaderVariation;
  });

export const deleteHeaderVariation = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { id: string }) => ({ id: String(data?.id ?? "") }))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const { error } = await (supabase as any)
      .from("post_header_variations")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Escolhe o cabeçalho a ser usado para um envio.
 * - custom → usa layout.header exatamente como está.
 * - auto   → escolhe aleatório entre variações ativas do usuário + globais,
 *            evitando os últimos N já enviados (anti-repetição).
 */
export async function resolveHeader(
  supabase: any,
  userId: string,
  layout: PostLayout,
  recentHeaders: string[] = [],
): Promise<string> {
  if (layout.header_mode !== "auto") return layout.header;
  const { data } = await supabase
    .from("post_header_variations")
    .select("text, active, user_id")
    .or(`user_id.eq.${userId},user_id.is.null`);
  const pool: string[] = (data ?? [])
    .filter((r: any) => r.active !== false && typeof r.text === "string" && r.text.trim())
    .map((r: any) => r.text as string);
  if (pool.length === 0) return layout.header;
  const recent = new Set(recentHeaders.filter(Boolean));
  const candidates = pool.filter((t) => !recent.has(t));
  const src = candidates.length > 0 ? candidates : pool;
  return src[Math.floor(Math.random() * src.length)];
}
