/**
 * Resolve o template visual ativo para publicação.
 *
 * Prioridade:
 *   1. Template is_default do canal (channel_id = X)
 *   2. Template is_default do usuário sem canal (channel_id IS NULL)
 *   3. Qualquer template mais recente do canal
 *   4. Qualquer template mais recente do usuário sem canal
 *   5. null
 *
 * Este módulo é server-only (nome *.server.ts). NÃO é integrado
 * a publicação ainda — usado por preview.functions.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { VTFormat } from "./presets";

export type VisualTemplateSource = "channel" | "user" | "global" | "none";

export interface ResolvedVisualTemplate {
  template: {
    id: string;
    user_id: string;
    channel_id: string | null;
    name: string;
    format: VTFormat;
    elements: unknown;
    is_default: boolean;
  } | null;
  source: VisualTemplateSource;
}

export async function resolveVisualTemplateForProduct(
  supabase: SupabaseClient<Database>,
  params: { userId: string; channelId: string | null; format: VTFormat },
): Promise<ResolvedVisualTemplate> {
  const { userId, channelId, format } = params;

  const baseSelect =
    "id,user_id,channel_id,name,format,elements,is_default,updated_at";

  // 1. Default do canal
  if (channelId) {
    const { data } = await supabase
      .from("visual_templates")
      .select(baseSelect)
      .eq("user_id", userId)
      .eq("format", format)
      .eq("channel_id", channelId)
      .eq("is_default", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return { template: data as never, source: "channel" };
  }

  // 2. Default do usuário sem canal
  {
    const { data } = await supabase
      .from("visual_templates")
      .select(baseSelect)
      .eq("user_id", userId)
      .eq("format", format)
      .is("channel_id", null)
      .eq("is_default", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return { template: data as never, source: "user" };
  }

  // 3. Qualquer do canal
  if (channelId) {
    const { data } = await supabase
      .from("visual_templates")
      .select(baseSelect)
      .eq("user_id", userId)
      .eq("format", format)
      .eq("channel_id", channelId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return { template: data as never, source: "channel" };
  }

  // 4. Qualquer global do usuário
  {
    const { data } = await supabase
      .from("visual_templates")
      .select(baseSelect)
      .eq("user_id", userId)
      .eq("format", format)
      .is("channel_id", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return { template: data as never, source: "global" };
  }

  return { template: null, source: "none" };
}
