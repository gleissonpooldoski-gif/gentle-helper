import { describe, it, expect } from "vitest";
import { validateShopeePriceUpdate } from "../price-guard";

const cur = (promoPrice: number | null, extra: Partial<{ itemId: string; shopId: string }> = {}) => ({
  promoPrice,
  itemId: extra.itemId ?? "1001",
  shopId: extra.shopId ?? "200",
});
const api = (
  price: number | null,
  extra: Partial<{ priceMin: number; priceMax: number; itemId: string; shopId: string }> = {},
) => ({
  price,
  priceMin: extra.priceMin ?? null,
  priceMax: extra.priceMax ?? null,
  itemId: extra.itemId ?? "1001",
  shopId: extra.shopId ?? "200",
});

describe("validateShopeePriceUpdate", () => {
  it("first fill accepted", () => {
    const r = validateShopeePriceUpdate(cur(null), api(50));
    expect(r.status).toBe("accepted");
    expect(r.reason).toBe("first_fill");
  });

  it("small drop accepted (79,90 → 69,90)", () => {
    const r = validateShopeePriceUpdate(cur(79.9), api(69.9));
    // 12.5% down without range → suspicious? Not: -12.5% > -40%, +12.5% < 60%
    expect(r.status).toBe("accepted");
  });

  it("suspicious drop blocked (79,90 → 35,96)", () => {
    const r = validateShopeePriceUpdate(cur(79.9), api(35.96));
    expect(r.status).toBe("blocked");
    expect(r.reason).toBe("suspicious_drop");
  });

  it("variant range: banco acima do teto → blocked", () => {
    const r = validateShopeePriceUpdate(
      cur(124.75),
      api(35.96, { priceMin: 35.96, priceMax: 79.91 }),
    );
    expect(r.status).toBe("blocked");
    expect(r.reason).toBe("possible_variant_mismatch_lower");
  });

  it("variant range: banco dentro da faixa → accepted", () => {
    const r = validateShopeePriceUpdate(
      cur(60),
      api(50, { priceMin: 40, priceMax: 80 }),
    );
    expect(r.status).toBe("accepted");
    expect(r.reason).toBe("moderate_change_within_range");
  });

  it("desconto real preservado (99,93 → 29,98)", () => {
    // Sem faixa declarada e queda > 40% → bloqueia (proteção conservadora).
    const r = validateShopeePriceUpdate(cur(99.93), api(29.98));
    expect(r.status).toBe("blocked");
    expect(r.reason).toBe("suspicious_drop");
  });

  it("desconto real com faixa consistente → accepted", () => {
    const r = validateShopeePriceUpdate(
      cur(99.93),
      api(29.98, { priceMin: 29.98, priceMax: 120 }),
    );
    expect(r.status).toBe("accepted");
    expect(r.reason).toBe("moderate_change_within_range");
  });

  it("shop mismatch blocked", () => {
    const r = validateShopeePriceUpdate(
      cur(50, { shopId: "200" }),
      api(50, { shopId: "999" }),
    );
    expect(r.status).toBe("blocked");
    expect(r.reason).toBe("shop_mismatch");
  });

  it("no new price blocked", () => {
    const r = validateShopeePriceUpdate(cur(50), api(null));
    expect(r.status).toBe("blocked");
    expect(r.reason).toBe("no_new_price");
  });

  it("suspicious jump blocked", () => {
    const r = validateShopeePriceUpdate(cur(50), api(120));
    expect(r.status).toBe("blocked");
    expect(r.reason).toBe("suspicious_jump");
  });
});
