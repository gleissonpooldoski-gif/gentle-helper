import { z } from "zod";

/**
 * Marketplaces suportados na v1. Adicionar novos exige apenas:
 *  1. estender este enum
 *  2. registrar um adapter em `adapters/index.ts`
 */
export const MarketplaceSchema = z.enum([
  "shopee",
  "amazon",
  "mercadolivre",
  "magalu",
  "aliexpress",
]);
export type Marketplace = z.infer<typeof MarketplaceSchema>;

export const MoneySchema = z.object({
  amount: z.number().nonnegative(), // sempre em centavos, evita float
  currency: z.string().length(3).default("BRL"),
});
export type Money = z.infer<typeof MoneySchema>;

export const ProductImageSchema = z.object({
  url: z.string().url(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  isPrimary: z.boolean().default(false),
});
export type ProductImage = z.infer<typeof ProductImageSchema>;

export const SellerSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  rating: z.number().min(0).max(5).optional(),
  officialStore: z.boolean().default(false),
});
export type Seller = z.infer<typeof SellerSchema>;

/**
 * Payload canônico. Este é o contrato entre o scraper, o banco de dados
 * e o pipeline de IA (geração de copy, thumbnails, etc).
 * Qualquer campo adicional específico do marketplace vai em `raw`.
 */
export const ProductPayloadSchema = z.object({
  // Identidade
  marketplace: MarketplaceSchema,
  externalId: z.string().min(1),          // SKU/ASIN/itemId do marketplace
  canonicalUrl: z.string().url(),         // URL limpa, sem tracking
  sourceUrl: z.string().url(),            // URL original enviada pelo usuário

  // Conteúdo
  title: z.string().min(1).max(500),
  description: z.string().max(20_000).optional(),
  brand: z.string().optional(),
  category: z.object({
    path: z.array(z.string()).min(1),     // ["Eletrônicos", "Smartphones"]
    id: z.string().optional(),
  }),

  // Preço
  price: MoneySchema,                     // preço "de"
  salePrice: MoneySchema.optional(),      // preço promocional, se houver
  discountPercent: z.number().min(0).max(100).optional(),
  installments: z
    .object({ count: z.number().int().positive(), value: MoneySchema })
    .optional(),

  // Mídia
  images: z.array(ProductImageSchema).min(1).max(20),

  // Vendedor / loja
  seller: SellerSchema.optional(),

  // Sinais
  rating: z.number().min(0).max(5).optional(),
  reviewsCount: z.number().int().nonnegative().optional(),
  availability: z.enum(["in_stock", "out_of_stock", "unknown"]).default("unknown"),

  // Metadados de extração
  scrapedAt: z.string().datetime(),
  extractionStrategy: z.enum(["api", "http", "headless"]),
  raw: z.record(z.string(), z.unknown()).optional(), // campos específicos do marketplace
});
export type ProductPayload = z.infer<typeof ProductPayloadSchema>;

/**
 * Entrada de um job de scraping.
 */
export const ScrapeJobInputSchema = z.object({
  url: z.string().url(),
  userId: z.string().uuid().optional(),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  forceRefresh: z.boolean().default(false),
});
export type ScrapeJobInput = z.infer<typeof ScrapeJobInputSchema>;

export const ScrapeJobResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), product: ProductPayloadSchema }),
  z.object({
    status: z.literal("error"),
    code: z.enum([
      "unsupported_marketplace",
      "blocked",
      "not_found",
      "parse_error",
      "timeout",
      "unknown",
    ]),
    message: z.string(),
  }),
]);
export type ScrapeJobResult = z.infer<typeof ScrapeJobResultSchema>;
