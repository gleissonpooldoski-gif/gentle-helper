/**
 * Server-function controllers for the Shopee bulk-import module.
 * The client parses the CSV, then calls `importShopeeBatch` in chunks
 * so that the UI can show progress ("3500 / 10000 produtos").
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
  rows: z.array(RowSchema).min(1).max(500),
});

export const importShopeeBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const outcome = await importBatch(
      context.supabase,
      context.userId,
      data.rows as ShopeeCsvRow[],
    );
    return outcome;
  });
