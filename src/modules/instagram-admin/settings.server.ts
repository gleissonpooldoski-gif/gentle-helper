import { decryptToken, encryptToken } from "@/lib/instagram-crypto.server";

export type InstagramAdminSettings = {
  instagramBusinessId: string;
  facebookPageId: string;
  accessToken: string;
};

export async function loadSettings(): Promise<InstagramAdminSettings | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("instagram_settings")
    .select("instagram_business_id,facebook_page_id,access_token_ciphertext")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    instagramBusinessId: data.instagram_business_id,
    facebookPageId: data.facebook_page_id,
    accessToken: decryptToken(data.access_token_ciphertext),
  };
}

export async function saveSettings(input: InstagramAdminSettings): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as any).from("instagram_settings").upsert({
    id: "default",
    instagram_business_id: input.instagramBusinessId,
    facebook_page_id: input.facebookPageId,
    access_token_ciphertext: encryptToken(input.accessToken),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export { encryptToken };
