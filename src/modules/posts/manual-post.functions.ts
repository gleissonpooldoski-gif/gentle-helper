import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { apiClient } from "@/lib/api-client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ManualPostDTO {
  id: string | null;
  channelId: string;
  productLink: string;
  keepLink: boolean;
  headerMode: "default" | "custom";
  customHeader: string;
  shopeeVideoLink: string;
  priceOriginal: string;
  priceCurrent: string;
  priceSuffix: string;
  priceInstallment: string;
  description: string;
  neverExpires: boolean;
  scheduledDate: string | null;
  scheduledTime: string | null;
  couponType: "fixed" | "percent" | "freight";
  couponValue: string;
  couponMinValue: string;
  couponCode: string;
  status: "draft" | "scheduled" | "sent" | "failed";
  lastError: string | null;
  sentAt: string | null;
}

const EMPTY = (channelId: string): ManualPostDTO => ({
  id: null,
  channelId,
  productLink: "",
  keepLink: true,
  headerMode: "default",
  customHeader: "",
  shopeeVideoLink: "",
  priceOriginal: "",
  priceCurrent: "",
  priceSuffix: "",
  priceInstallment: "",
  description: "",
  neverExpires: true,
  scheduledDate: null,
  scheduledTime: null,
  couponType: "percent",
  couponValue: "",
  couponMinValue: "",
  couponCode: "",
  status: "draft",
  lastError: null,
  sentAt: null,
});

function rowToDTO(r: any, channelId: string): ManualPostDTO {
  if (!r) return EMPTY(channelId);
  return {
    id: r.id,
    channelId: r.channel_id,
    productLink: r.product_link ?? "",
    keepLink: !!r.keep_link,
    headerMode: r.header_mode === "custom" ? "custom" : "default",
    customHeader: r.custom_header ?? "",
    shopeeVideoLink: r.shopee_video_link ?? "",
    priceOriginal: r.price_original ?? "",
    priceCurrent: r.price_current ?? "",
    priceSuffix: r.price_suffix ?? "",
    priceInstallment: r.price_installment ?? "",
    description: r.description ?? "",
    neverExpires: !!r.never_expires,
    scheduledDate: r.scheduled_date,
    scheduledTime: r.scheduled_time,
    couponType: (["fixed", "percent", "freight"].includes(r.coupon_type) ? r.coupon_type : "percent"),
    couponValue: r.coupon_value ?? "",
    couponMinValue: r.coupon_min_value ?? "",
    couponCode: r.coupon_code ?? "",
    status: (["draft", "scheduled", "sent", "failed"].includes(r.status) ? r.status : "draft"),
    lastError: r.last_error,
    sentAt: r.sent_at,
  };
}

function validateChannelId(id: unknown): string {
  const s = String(id ?? "").trim();
  if (!UUID_RE.test(s)) throw new Error("channelId inválido");
  return s;
}

/** Carrega o rascunho de post manual do canal. */
export const getManualPost = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: { channelId: string }) => ({ channelId: validateChannelId(data?.channelId) }))
  .handler(async ({ data, context }): Promise<ManualPostDTO> => {
    const { supabase, userId } = context;
    const { data: row, error } = await (supabase as any)
      .from("manual_posts")
      .select("*")
      .eq("user_id", userId)
      .eq("channel_id", data.channelId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return rowToDTO(row, data.channelId);
  });

export interface SaveManualPostInput {
  channelId: string;
  productLink?: string;
  keepLink?: boolean;
  headerMode?: "default" | "custom";
  customHeader?: string;
  shopeeVideoLink?: string;
  priceOriginal?: string;
  priceCurrent?: string;
  priceSuffix?: string;
  priceInstallment?: string;
  description?: string;
  neverExpires?: boolean;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  couponType?: "fixed" | "percent" | "freight";
  couponValue?: string;
  couponMinValue?: string;
  couponCode?: string;
}

/** Salva/atualiza o rascunho do post manual (um por canal). */
export const saveManualPost = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((data: SaveManualPostInput) => {
    const channelId = validateChannelId(data?.channelId);
    const link = String(data.productLink ?? "").trim();
    if (link && !/^https?:\/\//i.test(link)) {
      throw new Error("Link do produto deve começar com http(s)://");
    }
    const shopeeVideo = String(data.shopeeVideoLink ?? "").trim();
    if (shopeeVideo && !/^https?:\/\//i.test(shopeeVideo)) {
      throw new Error("Link Shopee Video deve começar com http(s)://");
    }
    return {
      channelId,
      productLink: link,
      keepLink: data.keepLink !== false,
      headerMode: data.headerMode === "custom" ? "custom" : "default",
      customHeader: String(data.customHeader ?? ""),
      shopeeVideoLink: shopeeVideo,
      priceOriginal: String(data.priceOriginal ?? ""),
      priceCurrent: String(data.priceCurrent ?? ""),
      priceSuffix: String(data.priceSuffix ?? ""),
      priceInstallment: String(data.priceInstallment ?? ""),
      description: String(data.description ?? ""),
      neverExpires: data.neverExpires !== false,
      scheduledDate: data.scheduledDate ? String(data.scheduledDate) : null,
      scheduledTime: data.scheduledTime ? String(data.scheduledTime) : null,
      couponType: (["fixed", "percent", "freight"].includes(String(data.couponType ?? ""))
        ? (data.couponType as "fixed" | "percent" | "freight")
        : "percent"),
      couponValue: String(data.couponValue ?? ""),
      couponMinValue: String(data.couponMinValue ?? ""),
      couponCode: String(data.couponCode ?? "").toUpperCase(),
    };
  })
  .handler(async ({ data, context }): Promise<ManualPostDTO> => {
    const { supabase, userId } = context;
    const isScheduled = !data.neverExpires && !!data.scheduledDate && !!data.scheduledTime;
    const payload = {
      user_id: userId,
      channel_id: data.channelId,
      product_link: data.productLink,
      keep_link: data.keepLink,
      header_mode: data.headerMode,
      custom_header: data.customHeader,
      shopee_video_link: data.shopeeVideoLink,
      price_original: data.priceOriginal,
      price_current: data.priceCurrent,
      price_suffix: data.priceSuffix,
      price_installment: data.priceInstallment,
      description: data.description,
      never_expires: data.neverExpires,
      scheduled_date: data.scheduledDate,
      scheduled_time: data.scheduledTime,
      coupon_type: data.couponType,
      coupon_value: data.couponValue,
      coupon_min_value: data.couponMinValue,
      coupon_code: data.couponCode,
      status: isScheduled && data.productLink ? "scheduled" : "draft",
      last_error: null,
    };
    const { data: row, error } = await (supabase as any)
      .from("manual_posts")
      .upsert(payload, { onConflict: "user_id,channel_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToDTO(row, data.channelId);
  });

/** Monta a legenda final combinando layout + overrides do post manual. */
export function buildManualCaption(
  layoutRendered: string,
  post: ManualPostDTO,
  headerOverride: string | null,
): string {
  let caption = layoutRendered;

  // Sufixo de preço (aparece depois do preço atual, se preenchido).
  if (post.priceSuffix && post.priceCurrent) {
    caption += `\n\n${post.priceSuffix}`;
  }

  // Cupom — só entra se houver código.
  if (post.couponCode) {
    const label =
      post.couponType === "fixed"
        ? "R$ Fixo"
        : post.couponType === "freight"
          ? "Frete Grátis"
          : "% Desconto";
    const lines = [`🎟️ *CUPOM ${label}*: \`${post.couponCode}\``];
    if (post.couponValue) lines.push(`💸 Valor: ${post.couponValue}`);
    if (post.couponMinValue) lines.push(`🧾 Pedido mínimo: ${post.couponMinValue}`);
    caption += `\n\n${lines.join("\n")}`;
  }

  // Cabeçalho dinâmico (custom) — prefixa antes do resto.
  if (headerOverride) {
    caption = `${headerOverride}\n\n${caption}`;
  }
  return caption;
}
