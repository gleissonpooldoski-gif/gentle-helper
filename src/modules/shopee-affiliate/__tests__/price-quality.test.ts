import { describe, it, expect } from "vitest";
import { classifyShopeePriceQuality, resolveDisplayOriginalPrice } from "../price-quality";

describe("classifyShopeePriceQuality", () => {
  it("HIGH: caso normal 100 → 70 (30% off)", () => {
    const r = classifyShopeePriceQuality({
      title: "Camiseta básica algodão",
      promo_price: 70,
      original_price: 100,
    });
    expect(r.quality).toBe("HIGH");
    expect(r.showComparison).toBe(true);
    expect(r.effectiveOriginal).toBe(100);
  });

  it("BLOCKED: kit 200 → 10 (95% off, ratio 20x)", () => {
    const r = classifyShopeePriceQuality({
      title: "Kit 30 unidades esponja de banho",
      promo_price: 10,
      original_price: 200,
    });
    expect(r.quality).toBe("BLOCKED");
    expect(r.showComparison).toBe(false);
    expect(r.reason).toBe("possible_variant_price_mismatch");
  });

  it("MEDIUM: sem original_price", () => {
    const r = classifyShopeePriceQuality({
      title: "Fone bluetooth",
      promo_price: 49.9,
      original_price: null,
    });
    expect(r.quality).toBe("MEDIUM");
    expect(r.showComparison).toBe(false);
    expect(r.effectivePromo).toBe(49.9);
  });

  it("LOW: desconto 85% sem termo de variação", () => {
    const r = classifyShopeePriceQuality({
      title: "Relogio digital esportivo",
      promo_price: 15,
      original_price: 100,
    });
    expect(r.quality).toBe("LOW");
    expect(r.showComparison).toBe(false);
  });

  it("BLOCKED: desconto > 90% mesmo sem termo variante", () => {
    const r = classifyShopeePriceQuality({
      title: "Mouse gamer",
      promo_price: 9,
      original_price: 100,
    });
    expect(r.quality).toBe("BLOCKED");
    expect(r.reason).toBe("extreme_discount");
  });

  it("MEDIUM: original <= promo", () => {
    const r = classifyShopeePriceQuality({
      title: "Produto qualquer",
      promo_price: 50,
      original_price: 50,
    });
    expect(r.quality).toBe("MEDIUM");
    expect(r.reason).toBe("original_le_promo");
  });

  it("BLOCKED: promo ausente", () => {
    const r = classifyShopeePriceQuality({
      title: "X",
      promo_price: null,
      original_price: 100,
    });
    expect(r.quality).toBe("BLOCKED");
    expect(r.reason).toBe("missing_promo_price");
  });

  it("HIGH: kit com desconto moderado (30%)", () => {
    // Termo variante mas desconto seguro → HIGH
    const r = classifyShopeePriceQuality({
      title: "Kit skincare hidratante",
      promo_price: 70,
      original_price: 100,
    });
    expect(r.quality).toBe("HIGH");
  });

  it("LOW: kit com desconto 60%", () => {
    const r = classifyShopeePriceQuality({
      title: "Combo 10 peças",
      promo_price: 40,
      original_price: 100,
    });
    expect(r.quality).toBe("LOW");
  });

  it("resolveDisplayOriginalPrice: não shopee retorna original bruto", () => {
    expect(
      resolveDisplayOriginalPrice({
        title: "kit 30",
        promo_price: 10,
        original_price: 200,
        platform: "amazon",
      }),
    ).toBe(200);
  });

  it("resolveDisplayOriginalPrice: shopee BLOCKED retorna null", () => {
    expect(
      resolveDisplayOriginalPrice({
        title: "kit 30 unidades",
        promo_price: 10,
        original_price: 200,
        platform: "shopee",
      }),
    ).toBeNull();
  });

  it("resolveDisplayOriginalPrice: shopee HIGH retorna original", () => {
    expect(
      resolveDisplayOriginalPrice({
        title: "Camiseta",
        promo_price: 70,
        original_price: 100,
        platform: "shopee",
      }),
    ).toBe(100);
  });
});
