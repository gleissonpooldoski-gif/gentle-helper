import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface FailureRow {
  id: string;
  config_id: string | null;
  product_id: string | null;
  group_id: string | null;
  instance_id: string | null;
  error_message: string;
  error_code: string | null;
  attempt_count: number;
  next_retry_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  product_title?: string | null;
  group_name?: string | null;
}

const sel = (s: string) => s;

export const listAutomationFailures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { includeResolved?: boolean; limit?: number }) => data ?? {})
  .handler(async ({ data, context }): Promise<FailureRow[]> => {
    const { supabase, userId } = context;
    const limit = Math.min(Math.max(data.limit ?? 200, 1), 500);
    let q = supabase
      .from("automation_failures")
      .select(sel("id, config_id, product_id, group_id, instance_id, error_message, error_code, attempt_count, next_retry_at, resolved_at, created_at, updated_at"))
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!data.includeResolved) q = q.is("resolved_at", null);
    const { data: rows, error } = await q.returns<FailureRow[]>();
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    if (list.length === 0) return [];

    const productIds = [...new Set(list.map((r) => r.product_id).filter(Boolean))] as string[];
    const productMap = new Map<string, string>();
    if (productIds.length > 0) {
      const { data: prods } = await supabase
        .from("products")
        .select(sel("id, title"))
        .in("id", productIds)
        .returns<{ id: string; title: string }[]>();
      for (const p of prods ?? []) {
        productMap.set(p.id, p.title);
      }
    }
    return list.map((r) => ({
      ...r,
      product_title: r.product_id ? productMap.get(r.product_id) ?? null : null,
      group_name: null,
    }));
  });

export const resolveFailure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("automation_failures")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const retryFailure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("automation_failures")
      .select("config_id, resolved_at")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle<{ config_id: string | null; resolved_at: string | null }>();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Falha não encontrada");
    if (row.config_id) {
      await supabase
        .from("automation_configs")
        .update({
          next_run_at: new Date().toISOString(),
          last_error: null,
          status: "running",
        })
        .eq("id", row.config_id)
        .eq("user_id", userId);
    }
    await supabase
      .from("automation_failures")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", userId);
    return { ok: true };
  });

export const countUnresolvedFailures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<number> => {
    const { supabase, userId } = context;
    const { count } = await supabase
      .from("automation_failures")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("resolved_at", null);
    return count ?? 0;
  });
