/**
 * Server-function controllers for the Shopee bulk-import module.
 * Cada import é isolado por `channelId` (grupo).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { importBatch } from "./shopee-import.service";
import type { ShopeeCsvRow } from "./csv.processor";

const RowSchema = z.object({
  itemId: z.string().min(1),
  itemName: z.string().min(1),
  price: z.number().nullable(),
  sales: z.number().int().nullable(),
  storeName: z.string(),
  commissionRate: z.number().nullable(),
  commissionValue: z.number().nullable(),
  productUrl: z.string().min(1),
  offerUrl: z.string().min(1),
  imageUrl: z.string().nullable(),
});

const InputSchema = z.object({
  channelId: z.string().uuid(),
  sourceGroupJid: z.string().trim().optional().default(""),
  rows: z.array(RowSchema).min(1).max(500),
});

export const importShopeeBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    // O grupo de origem do catálogo é o grupo monitorado do canal. Não confie
    // no primeiro card da tela: um canal pode ter vários grupos de destino e a
    // ordenação deles não define a propriedade dos produtos.
    const { data: group, error: groupError } = await context.supabase
      .from("monitored_groups")
      .select("group_jid, group_name")
      .eq("user_id", context.userId)
      .eq("channel_id", data.channelId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (groupError) throw new Error(groupError.message);
    if (!group) {
      throw new Error("Nenhum grupo de captura ativo está vinculado a este canal.");
    }
    const outcome = await importBatch(
      context.supabase,
      context.userId,
      data.channelId,
      group.group_jid,
      group.group_name ?? null,
      data.rows as ShopeeCsvRow[],
    );
    return outcome;
  });
