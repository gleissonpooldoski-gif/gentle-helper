/**
 * Parses a Shopee Affiliate CSV export into normalized rows.
 * Headers are matched by name (case-insensitive) and tolerate common variations.
 */
import Papa from "papaparse";

export type ShopeeCsvRow = {
  itemId: string;
  itemName: string;
  price: number | null;
  sales: number | null;
  storeName: string;
  commissionRate: number | null;
  commissionValue: number | null;
  productUrl: string;
  offerUrl: string;
  imageUrl: string | null;
};

export type ParseResult =
  | { ok: true; rows: ShopeeCsvRow[] }
  | { ok: false; error: string };

const HEADER_MAP: Record<keyof ShopeeCsvRow, string[]> = {
  itemId: ["item id", "itemid", "id do item", "id"],
  itemName: ["item name", "product name", "nome do produto", "nome"],
  price: ["price", "preço", "preco", "item price"],
  sales: ["sales", "vendas", "sold"],
  storeName: ["shop name", "store name", "nome da loja", "loja", "seller"],
  commissionRate: ["commission rate", "taxa de comissão", "taxa comissao"],
  commissionValue: ["commission", "comissão", "comissao", "commission amount"],
  productUrl: ["product link", "product url", "link do produto"],
  offerUrl: ["offer link", "affiliate link", "link de afiliado", "offer url"],
  imageUrl: [
    "image",
    "image url",
    "image link",
    "imagem",
    "url da imagem",
    "link da imagem",
    "picture",
    "picture url",
    "photo",
    "photo url",
    "cover image",
    "cover",
    "thumbnail",
    "image id",
    "image hash",
    "id da imagem",
    "hash da imagem",
    "item image",
    "product image",
    "main image",
  ],
};

const REQUIRED: Array<keyof ShopeeCsvRow> = ["itemId", "itemName", "offerUrl"];

function normalize(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseNumber(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseInteger(v: unknown): number | null {
  const n = parseNumber(v);
  return n == null ? null : Math.trunc(n);
}

export function parseShopeeCsv(text: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (!parsed.meta.fields || parsed.meta.fields.length === 0) {
    return { ok: false, error: "Planilha inválida. Envie o arquivo exportado do programa de afiliados Shopee." };
  }

  const headerIndex: Partial<Record<keyof ShopeeCsvRow, string>> = {};
  for (const field of parsed.meta.fields) {
    const norm = normalize(field);
    for (const [key, aliases] of Object.entries(HEADER_MAP) as Array<[keyof ShopeeCsvRow, string[]]>) {
      if (aliases.includes(norm)) {
        headerIndex[key] ??= field;
      }
    }
  }

  const missing = REQUIRED.filter((k) => !headerIndex[k]);
  if (missing.length > 0) {
    return {
      ok: false,
      error: "Arquivo incompleto. Verifique as colunas da planilha.",
    };
  }

  const rows: ShopeeCsvRow[] = [];
  for (const raw of parsed.data ?? []) {
    if (!raw) continue;
    const get = (k: keyof ShopeeCsvRow): string => {
      const col = headerIndex[k];
      return col ? String(raw[col] ?? "").trim() : "";
    };
    const itemId = get("itemId");
    const offerUrl = get("offerUrl");
    if (!itemId || !offerUrl) continue;

    rows.push({
      itemId,
      itemName: get("itemName") || "Produto Shopee",
      price: parseNumber(get("price")),
      sales: parseInteger(get("sales")),
      storeName: get("storeName"),
      commissionRate: parseNumber(get("commissionRate")),
      commissionValue: parseNumber(get("commissionValue")),
      productUrl: get("productUrl") || offerUrl,
      offerUrl,
      imageUrl: get("imageUrl") || null,
    });
  }

  return { ok: true, rows };
}
