import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { apiClient } from "@/lib/api-client";

export interface SiteConfigDTO {
  slug: string;
  title: string;
  subtitle: string;
  logoUrl: string | null;
  gaTag: string | null;
  themeColor: string;
  useForAmazonMl: boolean;
  useForAll: boolean;
}

const DEFAULT_CONFIG = (slug: string): SiteConfigDTO => ({
  slug,
  title: "Meu Site DvLinks",
  subtitle: "",
  logoUrl: null,
  gaTag: null,
  themeColor: "#3B82F6",
  useForAmazonMl: false,
  useForAll: false,
});

function slugFromUser(userId: string, email?: string | null): string {
  const base = (email ?? "").split("@")[0]?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (base && base.length >= 3) return base;
  return `u${userId.replace(/-/g, "").slice(0, 10)}`;
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

export const getSiteConfig = createServerFn({ method: "GET" })
  .middleware([apiClient, requireSupabaseAuth])
  .handler(async ({ context }): Promise<SiteConfigDTO> => {
    const { supabase, userId, claims } = context;
    const { data } = await supabase
      .from("site_configs")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (data) {
      return {
        slug: data.slug,
        title: data.title,
        logoUrl: data.logo_url,
        gaTag: data.ga_tag,
        themeColor: data.theme_color,
        useForAmazonMl: data.use_for_amazon_ml,
        useForAll: data.use_for_all,
      };
    }
    return DEFAULT_CONFIG(slugFromUser(userId, (claims as { email?: string })?.email));
  });

export const saveSiteConfig = createServerFn({ method: "POST" })
  .middleware([apiClient, requireSupabaseAuth])
  .inputValidator((input: Partial<SiteConfigDTO>) => input)
  .handler(async ({ data, context }): Promise<SiteConfigDTO> => {
    const { supabase, userId, claims } = context;
    const rawSlug = (data.slug ?? "").trim();
    const slug = sanitizeSlug(rawSlug) || slugFromUser(userId, (claims as { email?: string })?.email);
    if (slug.length < 3) throw new Error("Slug deve ter ao menos 3 caracteres.");

    // Verifica conflito de slug
    const { data: conflict } = await supabase
      .from("site_configs")
      .select("user_id")
      .eq("slug", slug)
      .neq("user_id", userId)
      .maybeSingle();
    if (conflict) throw new Error("Este link personalizado já está em uso.");

    const themeColor = /^#[0-9a-fA-F]{6}$/.test(data.themeColor ?? "") ? data.themeColor! : "#3B82F6";
    const title = (data.title ?? "").trim().slice(0, 120) || "Meu Site DvLinks";
    const gaTag = (data.gaTag ?? "").trim().slice(0, 40) || null;
    const logoUrl = (data.logoUrl ?? "").trim() || null;

    const payload = {
      user_id: userId,
      slug,
      title,
      logo_url: logoUrl,
      ga_tag: gaTag,
      theme_color: themeColor,
      use_for_amazon_ml: !!data.useForAmazonMl,
      use_for_all: !!data.useForAll,
    };

    const { error } = await supabase
      .from("site_configs")
      .upsert(payload as never, { onConflict: "user_id" });
    if (error) throw new Error(error.message);

    return {
      slug,
      title,
      logoUrl,
      gaTag,
      themeColor,
      useForAmazonMl: !!data.useForAmazonMl,
      useForAll: !!data.useForAll,
    };
  });
