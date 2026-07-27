/**
 * LOTE 18A — paridade final entre WhatsApp manual, Instagram DM e vitrine
 * pública. Todos consomem resolveProductDisplay(); estes casos garantem que
 * as regras "só mostra se tiver certeza" continuam aplicadas.
 */
import { describe, it, expect } from "vitest";
import { resolveProductDisplay } from "@/modules/products/display-resolver";

describe("LOTE 18A — regras finais de confiabilidade", () => {
  it("1) sales_historical=50000 + historical_confirmed → '50 mil vendidos'", () => {
    const r = resolveProductDisplay({
      platform: "shopee",
      sales_historical: 50000,
      sales_source: "historical_confirmed",
    });
    expect(r.salesLabel).toBe("50 mil vendidos");
  });

  it("2) sales_recent=50000 sem source confirmado → sem linha de vendidos", () => {
    const r = resolveProductDisplay({
      platform: "shopee",
      sales_recent: 50000,
      sales_source: "affiliate_api",
    });
    expect(r.salesLabel).toBe("");
    expect(r.salesValue).toBeNull();
  });

  it("3) price_quality=HIGH → mostra DE/POR", () => {
    const r = resolveProductDisplay({
      platform: "shopee",
      promo_price: 40,
      original_price: 60,
      price_quality: "HIGH",
    });
    expect(r.priceOriginalDisplay).toBe(60);
    expect(r.priceCurrentDisplay).toBe(40);
  });

  it("4a) price_quality=LOW → suprime DE/POR", () => {
    const r = resolveProductDisplay({
      platform: "shopee",
      promo_price: 10,
      original_price: 100,
      price_quality: "LOW",
    });
    expect(r.priceOriginalDisplay).toBeNull();
    expect(r.discountPct).toBeNull();
  });

  it("4b) price_quality=BLOCKED → suprime DE/POR", () => {
    const r = resolveProductDisplay({
      platform: "shopee",
      promo_price: 10,
      original_price: 200,
      price_quality: "BLOCKED",
    });
    expect(r.priceOriginalDisplay).toBeNull();
    expect(r.discountPct).toBeNull();
  });

  it("5) original>promo mas price_quality bloqueado → sem desconto", () => {
    const r = resolveProductDisplay({
      platform: "shopee",
      promo_price: 29.9,
      original_price: 499.9,
      price_quality: "BLOCKED",
    });
    expect(r.priceOriginalDisplay).toBeNull();
    expect(r.discountPct).toBeNull();
    expect(r.priceCurrentDisplay).toBe(29.9);
  });
});
