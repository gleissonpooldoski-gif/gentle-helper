import { describe, it, expect } from "vitest";
import { resolveProduct } from "@/modules/visual-templates/bindings";

const base = {
  id: "p1",
  title: "Fone Bluetooth XYZ",
  image_url: null,
  sales: null,
  sales_label: null,
  store_name: "Loja",
};

describe("LOTE 17A — resolveProduct usa camada central para DE/POR", () => {
  it("Shopee HIGH: mostra DE/POR", () => {
    const r = resolveProduct({
      ...base,
      platform: "shopee",
      original_price: 100,
      promo_price: 50,
      price_quality: "HIGH",
    } as any);
    expect(r.hasOriginal).toBe(true);
    expect(r.original).toContain("100");
    expect(r.discount).toBe("-50%");
  });

  it("Shopee LOW: suprime DE/POR mesmo com original > promo", () => {
    const r = resolveProduct({
      ...base,
      platform: "shopee",
      original_price: 100,
      promo_price: 10,
      price_quality: "LOW",
    } as any);
    expect(r.hasOriginal).toBe(false);
    expect(r.original).toBe("");
    expect(r.discount).toBe("");
  });

  it("Shopee BLOCKED: suprime DE/POR", () => {
    const r = resolveProduct({
      ...base,
      platform: "shopee",
      original_price: 500,
      promo_price: 20,
      price_quality: "BLOCKED",
    } as any);
    expect(r.hasOriginal).toBe(false);
  });

  it("Shopee MEDIUM: suprime DE/POR (só HIGH exibe)", () => {
    const r = resolveProduct({
      ...base,
      platform: "shopee",
      original_price: 100,
      promo_price: 50,
      price_quality: "MEDIUM",
    } as any);
    expect(r.hasOriginal).toBe(false);
  });

  it("Non-Shopee: mantém comportamento (original > promo => DE/POR)", () => {
    const r = resolveProduct({
      ...base,
      platform: "mercadolivre",
      original_price: 100,
      promo_price: 80,
    } as any);
    expect(r.hasOriginal).toBe(true);
    expect(r.discount).toBe("-20%");
  });
});
