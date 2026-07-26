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

export type HeaderVariationType = "normal" | "discount";

export interface HeaderVariation {
  id: string;
  user_id: string | null;
  text: string;
  active: boolean;
  type: HeaderVariationType;
}

function normalizeHeaderType(v: unknown): HeaderVariationType {
  return v === "discount" ? "discount" : "normal";
}

export const listHeaderVariations = createServerFn({ method: "GET" })
  .middleware([apiClient, requireSupabaseAuth])
  .handler(async ({ context }): Promise<HeaderVariation[]> => {
    const { supabase } = context;
    const { data, error } = await (supabase as any)
      .from("post_header_variations")
      .select("id, user_id, text, active, type")
      .order("user_id", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      text: r.text,
      active: r.active,
      type: normalizeHeaderType(r.type),
    })) as HeaderVariation[];
  });

export const addHeaderVariation = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { text: string; type?: HeaderVariationType }) => ({
    text: String(data?.text ?? "").trim(),
    type: normalizeHeaderType(data?.type),
  }))
  .handler(async ({ data, context }): Promise<HeaderVariation> => {
    if (!data.text) throw new Error("Texto obrigatório");
    const { supabase, userId } = context;
    const { data: row, error } = await (supabase as any)
      .from("post_header_variations")
      .insert({ user_id: userId, text: data.text, active: true, type: data.type })
      .select("id, user_id, text, active, type")
      .single();
    if (error) throw new Error(error.message);
    return { ...row, type: normalizeHeaderType(row.type) } as HeaderVariation;
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
 *            filtrando por tipo (discount se o produto tem preço promocional,
 *            normal caso contrário). Evita repetir os últimos N enviados.
 *            Fallback: se não houver frase do tipo pedido, usa qualquer ativa.
 */
export async function resolveHeader(
  supabase: any,
  userId: string,
  layout: PostLayout,
  recentHeaders: string[] = [],
  opts: { hasDiscount?: boolean } = {},
): Promise<string> {
  if (layout.header_mode !== "auto") return layout.header;
  const { data } = await supabase
    .from("post_header_variations")
    .select("text, active, user_id, type")
    .or(`user_id.eq.${userId},user_id.is.null`);
  const all = (data ?? []).filter(
    (r: any) => r.active !== false && typeof r.text === "string" && r.text.trim(),
  );
  if (all.length === 0) return layout.header;
  const wanted: HeaderVariationType = opts.hasDiscount ? "discount" : "normal";
  const typed = all.filter((r: any) => normalizeHeaderType(r.type) === wanted);
  const pool: string[] = (typed.length > 0 ? typed : all).map((r: any) => r.text as string);
  const recent = new Set(recentHeaders.filter(Boolean));
  const candidates = pool.filter((t) => !recent.has(t));
  const src = candidates.length > 0 ? candidates : pool;
  return src[Math.floor(Math.random() * src.length)];
}

export function productHasDiscount(product: {
  promo_price?: number | string | null;
  original_price?: number | string | null;
}): boolean {
  const promo = Number(product?.promo_price);
  const original = Number(product?.original_price);
  return Number.isFinite(promo) && Number.isFinite(original) && original > promo && promo > 0;
}

/* ==================== Enviar teste ==================== */

function normalizePhone(input: string): string | null {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  // Se o usuário não incluir DDI (55), assumimos Brasil.
  return digits.length <= 11 ? `55${digits}` : digits;
}

function sanitizeLayoutInput(input: any): PostLayout {
  return normalize({
    header: input?.header,
    header_mode: input?.header_mode,
    title_template: input?.title_template,
    upper_title: input?.upper_title,
    hide_sales: input?.hide_sales,
    sales_template: input?.sales_template,
    description_template: input?.description_template,
    hide_original: input?.hide_original,
    original_price_template: input?.original_price_template,
    installment_template: input?.installment_template,
    price_template: input?.price_template,
    link_template: input?.link_template,
    footer: input?.footer,
  });
}

/**
 * Renderiza o layout atual (mesmo o não salvo) usando um produto real do canal
 * e envia como mensagem de mídia para o número informado. Usado no editor de
 * Post/Layout para pré-visualizar o template diretamente no WhatsApp.
 */
export const sendLayoutTestMessage = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: {
    channelId: string;
    phone: string;
    layout?: Partial<PostLayout>;
    productId?: string;
  }) => {
    const channelId = isUuid(data?.channelId) ? (data.channelId as string) : null;
    if (!channelId) throw new Error("Canal inválido");
    const phone = normalizePhone(data?.phone ?? "");
    if (!phone) throw new Error("Número de WhatsApp inválido");
    return {
      channelId,
      phone,
      layout: data?.layout ?? null,
      productId: isUuid(data?.productId) ? (data.productId as string) : null,
    };
  })
  .handler(async ({ data, context }): Promise<{
    ok: true;
    jid: string;
    productTitle: string;
    caption: string;
  }> => {
    const { supabase, userId } = context;

    // Produto: usa o informado ou pega o mais recente COM imagem do canal.
    let productQuery = (supabase as any)
      .from("products")
        .select("id, title, platform, promo_price, original_price, sales, sales_label, sales_recent, sales_historical, sales_source, price_quality, price_quality_reason, affiliate_link, image_url")
        .eq("user_id", userId)
        .eq("channel_id", data.channelId)
        .eq("id", data.productId)
        .limit(1);
    }
    const { data: prods, error: prodErr } = await productQuery;
    if (prodErr) throw new Error(prodErr.message);
    const prod = (prods ?? [])[0];
    if (!prod) throw new Error("Nenhum produto com imagem neste canal. Capture/importe pelo menos um antes.");

    // Instância: primeira conectada do canal, ou primeira conectada do usuário.
    const { data: instances } = await (supabase as any)
      .from("whatsapp_instances")
      .select("id, provider, instance_name, status, channel_id")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    const list = (instances ?? []) as Array<{
      id: string; provider: string; instance_name: string; status: string; channel_id: string | null;
    }>;
    const instance =
      list.find((i) => i.status === "connected" && i.channel_id === data.channelId) ??
      list.find((i) => i.status === "connected");
    if (!instance) throw new Error("Nenhuma instância WhatsApp conectada.");

    // Layout: usa o snapshot enviado (permite testar edições não salvas) ou o salvo.
    const layout = data.layout
      ? sanitizeLayoutInput(data.layout)
      : await loadLayoutFor(supabase, userId, data.channelId);

    const hasDiscount = productHasDiscount({
      promo_price: prod.promo_price,
      original_price: prod.original_price,
    });
    const chosenHeader = await resolveHeader(supabase, userId, layout, [], { hasDiscount });
    const { renderPost } = await import("./render");
    const { formatSalesLabel } = await import("@/modules/products/sales-label");
    const vendasFinal = formatSalesLabel(prod.sales == null ? null : Number(prod.sales));
    const caption = renderPost({ ...layout, header: chosenHeader }, {
      title: prod.title,
      description: null,
      price: prod.promo_price,
      price_original: prod.original_price,
      parcelamento: null,
      vendas: vendasFinal,
      link: prod.affiliate_link,
      image: prod.image_url,
    }, "whatsapp");

    try {
      console.log("[COMPARE_POST_PIPELINE]", {
        source: "preview",
        title: prod.title,
        vendas: vendasFinal,
        sales_label: prod.sales_label ?? null,
        sales: prod.sales ?? null,
        price: prod.promo_price,
        price_original: prod.original_price,
        promo_price: prod.promo_price ?? null,
        original_price: prod.original_price ?? null,
        channel_id: data.channelId,
        group_id: null,
        config_id: null,
        header_mode: layout.header_mode,
        header: chosenHeader,
      });
    } catch { /* noop */ }

    const jid = `${data.phone}@s.whatsapp.net`;
    const { getWhatsAppProvider } = await import("@/modules/whatsapp/index.server");
    const provider = getWhatsAppProvider(instance.provider);
    const live = await provider.getStatus(instance.instance_name);
    if (live.status !== "connected") {
      throw new Error("Instância não conectada. Reconecte antes de testar.");
    }
    console.log("[WHATSAPP_FINAL_CAPTION]", { source: "preview", instance: instance.instance_name, jid, caption });
    await provider.sendMedia(instance.instance_name, jid, {
      mediaUrl: prod.image_url,
      caption,
    });


    try {
      await (supabase as any).from("whatsapp_send_history").insert({
        user_id: userId,
        instance_id: instance.id,
        product_id: prod.id,
        jid,
        caption,
        media_url: prod.image_url,
        status: "sent",
      });
    } catch { /* histórico é best-effort */ }

    return { ok: true, jid, productTitle: prod.title, caption };
  });
