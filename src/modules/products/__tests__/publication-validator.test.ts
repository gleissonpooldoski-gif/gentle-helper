import { describe, it, expect, vi } from "vitest";
import { validateProductForPublication } from "@/modules/products/publication-validator";

const base = {
  id: "p1",
  platform: "shopee",
  title: "Fone Bluetooth",
  promo_price: 100,
};

describe("publication-validator", () => {
  it("aprova vendas apenas com sales_historical + historical_confirmed", () => {
    const v = validateProductForPublication(
      { ...base, sales_historical: 50000, sales_source: "historical_confirmed" },
      { channel: "whatsapp_auto", log: () => {} },
    );
    expect(v.salesApproved).toBe(true);
    expect(v.display.salesLabel).toMatch(/vendidos/);
  });

  it("suprime vendas quando fonte é apenas sales_recent/Affiliate", () => {
    const logs: unknown[] = [];
    const v = validateProductForPublication(
      { ...base, sales_recent: 900, sales_source: "affiliate_recent" },
      { channel: "whatsapp_auto", log: (e, p) => logs.push({ e, p }) },
    );
    expect(v.salesApproved).toBe(false);
    expect(v.display.salesLabel).toBe("");
    expect(v.removed).toContain("sales");
    expect(logs.length).toBe(1);
  });

  it("mostra DE/POR quando price_quality=HIGH", () => {
    const v = validateProductForPublication(
      { ...base, original_price: 200, promo_price: 150, price_quality: "HIGH" },
      { channel: "instagram_story", log: () => {} },
    );
    expect(v.discountApproved).toBe(true);
    expect(v.display.priceOriginalDisplay).toBe(200);
  });

  it("suprime DE/POR quando price_quality=LOW (kit)", () => {
    const v = validateProductForPublication(
      { ...base, title: "Kit 10 Fones", original_price: 200, promo_price: 20, price_quality: "LOW" },
      { channel: "whatsapp_manual", log: () => {} },
    );
    expect(v.discountApproved).toBe(false);
    expect(v.display.priceOriginalDisplay).toBeNull();
    expect(v.removed).toContain("discount");
  });

  it("bloqueia publicação com price_quality=BLOCKED", () => {
    const v = validateProductForPublication(
      { ...base, original_price: 5000, promo_price: 10, price_quality: "BLOCKED" },
      { channel: "whatsapp_auto", log: () => {} },
    );
    expect(v.allowed).toBe(false);
  });

  it("emite PRODUCT_DATA_REMOVED com channel e product_id", () => {
    const spy = vi.fn();
    validateProductForPublication(
      { ...base, sales_recent: 100, original_price: 200, promo_price: 150, price_quality: "LOW" },
      { channel: "public_page", log: spy },
    );
    expect(spy).toHaveBeenCalledWith(
      "PRODUCT_DATA_REMOVED",
      expect.objectContaining({ channel: "public_page", product_id: "p1" }),
    );
  });
});
