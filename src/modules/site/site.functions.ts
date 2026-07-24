import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { apiClient } from "@/lib/api-client";
import { z } from "zod";

export interface SiteConfigDTO {
  channelId: string;
  slug: string;
  title: string;
  subtitle: string;
  logoUrl: string | null;
  gaTag: string | null;
  themeColor: string;
  useForAmazonMl: boolean;
  useForAll: boolean;
}

function slugFromChannel(channelName: string, channelId: string): string {
  const base = sanitizeSlug(channelName);
  if (base.length >= 3) return base;
  return `g${channelId.replace(/-/g, "").slice(0, 10)}`;
}

function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const channelIdInput = z.object({ channelId: z.string().uuid() });

export const getSiteConfig = createServerFn({ method: "GET" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((input: { channelId: string }) => channelIdInput.parse(input))
  .handler(async ({ data, context }): Promise<SiteConfigDTO> => {
    const { supabase, userId } = context;
    // Ensure channel belongs to user
    const { data: ch, error: chErr } = await supabase
      .from("channels")
      .select("id, name")
      .eq("id", data.channelId)
      .eq("user_id", userId)
      .maybeSingle();
    if (chErr || !ch) throw new Error("Canal não encontrado.");

    const { data: row } = await supabase
      .from("site_configs")
      .select("*")
      .eq("channel_id", data.channelId)
      .maybeSingle();
    if (row) {
      return {
        channelId: data.channelId,
        slug: row.slug,
        title: row.title,
        subtitle: (row as { subtitle?: string }).subtitle ?? "",
        logoUrl: row.logo_url,
        gaTag: row.ga_tag,
        themeColor: row.theme_color,
        useForAmazonMl: row.use_for_amazon_ml,
        useForAll: row.use_for_all,
      };
    }
    return {
      channelId: data.channelId,
      slug: slugFromChannel(ch.name ?? "", data.channelId),
      title: ch.name ?? "Meu Site DvLinks",
      subtitle: "",
      logoUrl: null,
      gaTag: null,
      themeColor: "#3B82F6",
      useForAmazonMl: false,
      useForAll: false,
    };
  });

export const saveSiteConfig = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((input: Partial<SiteConfigDTO> & { channelId: string }) =>
    input,
  )
  .handler(async ({ data, context }): Promise<SiteConfigDTO> => {
    const { supabase, userId } = context;
    if (!data.channelId) throw new Error("channelId obrigatório.");

    const { data: ch, error: chErr } = await supabase
      .from("channels")
      .select("id, name")
      .eq("id", data.channelId)
      .eq("user_id", userId)
      .maybeSingle();
    if (chErr || !ch) throw new Error("Canal não encontrado.");

    const rawSlug = (data.slug ?? "").trim();
    const slug = sanitizeSlug(rawSlug) || slugFromChannel(ch.name ?? "", data.channelId);
    if (slug.length < 3) throw new Error("Slug deve ter ao menos 3 caracteres.");

    // Conflict check: slug used by a different channel
    const { data: conflict } = await supabase
      .from("site_configs")
      .select("channel_id")
      .eq("slug", slug)
      .neq("channel_id", data.channelId)
      .maybeSingle();
    if (conflict) throw new Error("Este link personalizado já está em uso por outro grupo.");

    const themeColor = /^#[0-9a-fA-F]{6}$/.test(data.themeColor ?? "") ? data.themeColor! : "#3B82F6";
    const title = (data.title ?? "").trim().slice(0, 120) || (ch.name ?? "Meu Site DvLinks");
    const subtitle = (data.subtitle ?? "").trim().slice(0, 160);
    const gaTag = (data.gaTag ?? "").trim().slice(0, 40) || null;
    const logoUrl = (data.logoUrl ?? "").trim() || null;

    const payload = {
      user_id: userId,
      channel_id: data.channelId,
      slug,
      title,
      subtitle,
      logo_url: logoUrl,
      ga_tag: gaTag,
      theme_color: themeColor,
      use_for_amazon_ml: !!data.useForAmazonMl,
      use_for_all: !!data.useForAll,
    };

    const { error } = await supabase
      .from("site_configs")
      .upsert(payload as never, { onConflict: "channel_id" });
    if (error) throw new Error(error.message);

    return {
      channelId: data.channelId,
      slug,
      title,
      subtitle,
      logoUrl,
      gaTag,
      themeColor,
      useForAmazonMl: !!data.useForAmazonMl,
      useForAll: !!data.useForAll,
    };
  });
