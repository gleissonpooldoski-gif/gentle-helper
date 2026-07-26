import { describe, it, expect } from "vitest";
import { resolveProductDisplay } from "@/modules/products/display-resolver";

describe("resolveProductDisplay — vendas (LOTE 16F: só historical_confirmed)", () => {
  it("usa sales_historical confirmado e exibe 'X vendidos'", () => {
    const r = resolveProductDisplay({
      platform: "shopee",
      sales_historical: 50000,
      sales_source: "historical_confirmed",
      sales_recent: 5000,
      sales: 5000,
    });
    expect(r.salesSource).toBe("historical");
    expect(r.salesLabel).toBe("50 mil vendidos");
  });

  it("sales_historical sem source confirmado é ignorado", () => {
    const r = resolveProductDisplay({
      platform: "shopee",
      sales_historical: 50000,
      // sales_source ausente
    });
    expect(r.salesSource).toBeNull();
    expect(r.salesLabel).toBe("");
  });

  it("ignora sales_recent — não gera prova social", () => {
    const r = resolveProductDisplay({
      platform: "shopee",
      sales_recent: 5000,
      sales: 5000,
    });
    expect(r.salesSource).toBeNull();
    expect(r.salesLabel).toBe("");
    expect(r.salesValue).toBeNull();
  });

  it("ignora sales legacy da Shopee", () => {
    const r = resolveProductDisplay({ platform: "shopee", sales: 500 });
    expect(r.salesSource).toBeNull();
    expect(r.salesLabel).toBe("");
  });

  it("ignora sales legacy de outras plataformas", () => {
    const r = resolveProductDisplay({ platform: "amazon", sales: 500 });
    expect(r.salesLabel).toBe("");
    expect(r.salesSource).toBeNull();
  });

  it("sem vendas retorna label vazio", () => {
    const r = resolveProductDisplay({ platform: "shopee" });
    expect(r.salesLabel).toBe("");
    expect(r.salesValue).toBeNull();
  });

  it("historical baixo confirmado é exibido cru, sem sufixo 'recentemente'", () => {
    const r = resolveProductDisplay({
      platform: "shopee",
      sales_historical: 500,
      sales_source: "historical_confirmed",
    });
    expect(r.salesLabel).toBe("500 vendidos");
    expect(r.salesIsRecentOnly).toBe(false);
  });
});

describe("resolveProductDisplay — preço", () => {
  it("Shopee HIGH persistido mostra DE/POR", () => {
    const r = resolveProductDisplay({
      platform: "shopee",
      title: "Produto simples",
      promo_price: 40,
      original_price: 60,
      price_quality: "HIGH",
    });
    expect(r.priceOriginalDisplay).toBe(60);
    expect(r.discountPct).toBe(33);
  });

  it("Shopee BLOCKED persistido suprime original", () => {
    const r = resolveProductDisplay({
      platform: "shopee",
      title: "Kit 10 unidades",
      promo_price: 10,
      original_price: 200,
      price_quality: "BLOCKED",
    });
    expect(r.priceOriginalDisplay).toBeNull();
    expect(r.discountPct).toBeNull();
  });

  it("Shopee sem price_quality persistido classifica em runtime (kit + desconto extremo)", () => {
    const r = resolveProductDisplay({
      platform: "shopee",
      title: "Kit 10 fraldas",
      promo_price: 28.98,
      original_price: 120.75,
    });
    expect(r.priceQuality).toBe("BLOCKED");
    expect(r.priceOriginalDisplay).toBeNull();
  });

  it("Non-Shopee preserva original_price original", () => {
    const r = resolveProductDisplay({
      platform: "amazon",
      title: "Kit 10",
      promo_price: 10,
      original_price: 200,
    });
    expect(r.priceOriginalDisplay).toBe(200);
  });
});
