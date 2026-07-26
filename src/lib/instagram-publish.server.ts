import { decryptToken } from "./instagram-crypto.server";
import { publishImagePost, publishImageStory } from "./instagram-graph.server";

function fillVars(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

export async function publishForChannel(input: {
  channelId: string;
  productId: string;
  kind: "post" | "story";
  userId: string;
  templateId?: string;
}): Promise<{ mediaId: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const tplQuery = input.templateId
    ? supabaseAdmin.from("instagram_story_templates").select("*").eq("id", input.templateId).maybeSingle()
    : supabaseAdmin.from("instagram_story_templates").select("*").eq("channel_id", input.channelId).eq("active", true).maybeSingle();
  const [{ data: conn }, { data: product }, { data: tpl }] = await Promise.all([
    supabaseAdmin.from("instagram_connections").select("*").eq("channel_id", input.channelId).maybeSingle(),
    supabaseAdmin.from("products").select("*").eq("id", input.productId).maybeSingle(),
    tplQuery,
  ]);
  if (!conn || conn.status !== "connected" || !conn.access_token_ciphertext || !conn.instagram_account_id) {
    throw new Error("Instagram não está conectado neste canal.");
  }
  if (!product) throw new Error("Produto não encontrado.");
  if (!product.image_url) throw new Error("Produto sem imagem.");

  const token = decryptToken(conn.access_token_ciphertext);
  const brl = (n: number | null | undefined) => n != null ? `R$ ${Number(n).toFixed(2).replace(".", ",")}` : "";
  const discount = product.original_price && product.promo_price
    ? `${Math.round((1 - Number(product.promo_price) / Number(product.original_price)) * 100)}%`
    : "";
  const vars = {
    title: product.title ?? "",
    price: brl(product.promo_price ?? product.original_price),
    price_original: brl(product.original_price),
    discount,
    store: product.store_name ?? product.platform ?? "",
    link: product.affiliate_link ?? product.raw_link ?? "",
  };
  const captionTpl = tpl?.caption_template ?? "🔥 {title}\n💰 {price}\n\nClique no link 👇\n{link}";
  const caption = fillVars(captionTpl, vars);

  let mediaId: string;
  try {
    if (input.kind === "story") {
      mediaId = await publishImageStory({
        igId: conn.instagram_account_id, token, imageUrl: product.image_url,
      });
    } else {
      mediaId = await publishImagePost({
        igId: conn.instagram_account_id, token, imageUrl: product.image_url, caption,
      });
    }
    await supabaseAdmin.from("instagram_posts").insert({
      user_id: input.userId,
      channel_id: input.channelId,
      product_id: input.productId,
      instagram_media_id: mediaId,
      kind: input.kind,
      status: "published",
      caption,
      published_at: new Date().toISOString(),
    });
    return { mediaId };
  } catch (e: any) {
    await supabaseAdmin.from("instagram_posts").insert({
      user_id: input.userId,
      channel_id: input.channelId,
      product_id: input.productId,
      kind: input.kind,
      status: "failed",
      caption,
      error_message: String(e?.message ?? e),
    });
    throw e;
  }
}
