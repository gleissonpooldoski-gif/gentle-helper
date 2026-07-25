import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PRESETS, FORMAT_SIZE, type VTFormat, type VTElement } from "./presets";

const FormatEnum = z.enum(["ig_story", "ig_post", "whatsapp"]);

export const listVisualTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { format?: string; channelId?: string | null }) => d ?? {})
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("visual_templates")
      .select("id,name,format,preset,preview_url,is_default,channel_id,updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (data.format) q = q.eq("format", data.format);
    if (data.channelId) q = q.eq("channel_id", data.channelId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getVisualTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("visual_templates")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Template não encontrado");
    return row;
  });

export const createVisualTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; format: string; preset: string; channelId?: string | null }) =>
    z
      .object({
        name: z.string().min(1).max(120),
        format: FormatEnum,
        preset: z.string().min(1),
        channelId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const factory = PRESETS[data.preset] ?? PRESETS.blank;
    const elements = factory(data.format as VTFormat);
    const { data: row, error } = await context.supabase
      .from("visual_templates")
      .insert({
        user_id: context.userId,
        name: data.name,
        format: data.format,
        preset: data.preset,
        channel_id: data.channelId ?? null,
        elements: elements as unknown as never,

      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const saveVisualTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id: string;
      name?: string;
      elements?: VTElement[];
      preview_url?: string | null;
    }) =>
      z
        .object({
          id: z.string().uuid(),
          name: z.string().min(1).max(120).optional(),
          elements: z.array(z.any()).optional(),
          preview_url: z.string().url().nullable().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.elements !== undefined) patch.elements = data.elements;
    if (data.preview_url !== undefined) patch.preview_url = data.preview_url;
    const { error } = await context.supabase
      .from("visual_templates")
      .update(patch as never)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateVisualTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: src, error } = await context.supabase
      .from("visual_templates")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error || !src) throw new Error(error?.message ?? "Template não encontrado");
    const { data: row, error: insErr } = await context.supabase
      .from("visual_templates")
      .insert({
        user_id: context.userId,
        name: `${src.name} (cópia)`,
        format: src.format,
        preset: src.preset,
        channel_id: src.channel_id,
        elements: src.elements,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    return { id: row.id };
  });

export const deleteVisualTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("visual_templates")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setDefaultVisualTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: tpl, error: getErr } = await context.supabase
      .from("visual_templates")
      .select("format,channel_id")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (getErr || !tpl) throw new Error(getErr?.message ?? "Template não encontrado");
    // clear siblings
    let q = context.supabase
      .from("visual_templates")
      .update({ is_default: false })
      .eq("user_id", context.userId)
      .eq("format", tpl.format);
    q = tpl.channel_id ? q.eq("channel_id", tpl.channel_id) : q.is("channel_id", null);
    await q;
    const { error: setErr } = await context.supabase
      .from("visual_templates")
      .update({ is_default: true })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (setErr) throw new Error(setErr.message);
    return { ok: true };
  });

export const listChannelProductsLite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { channelId?: string | null }) => d ?? {})
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("products")
      .select("id,title,image_url,original_price,promo_price,sales,sales_label,store_name")
      .eq("user_id", context.userId)
      .not("image_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.channelId) q = q.eq("channel_id", data.channelId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export { FORMAT_SIZE };
