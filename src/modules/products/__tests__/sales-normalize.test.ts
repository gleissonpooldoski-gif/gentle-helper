import { describe, it, expect } from "vitest";
import { normalizeSales } from "../sales-normalize";
import { formatSalesLabel } from "../sales-label";

describe("normalizeSales", () => {
  const cases: Array<[unknown, number | null]> = [
    [null, null],
    [undefined, null],
    ["", null],
    [0, null],
    [2, 2],
    ["600", 600],
    ["1000", 1000],
    ["6000", 6000],
    ["6.000", 6000],
    ["6,000", 6000],
    ["6 mil", 6000],
    ["6mil", 6000],
    ["6k", 6000],
    ["6K", 6000],
    ["1.5k", 1500],
    ["6,5 mil", 6500],
    ["12500", 12500],
    ["12.500", 12500],
    ["12,5 mil", 12500],
    ["150000", 150000],
    ["150 mil", 150000],
    ["1500000", 1500000],
    ["1,5 milhão", 1500000],
    ["1,5 milhões", 1500000],
    ["1,5 mi", 1500000],
    ["300+", 300],
    ["10+", 10],
    ["6 mil vendidos", 6000],
    ["Mais de 1000 vendidos", 1000],
  ];
  for (const [input, expected] of cases) {
    it(`normaliza ${JSON.stringify(input)} → ${expected}`, () => {
      expect(normalizeSales(input)).toBe(expected);
    });
  }
});

describe("pipeline normalize + formatSalesLabel", () => {
  const cases: Array<[unknown, string | null]> = [
    [0, null],
    [2, "2"],
    ["600", "600"],
    ["1000", "1 mil"],
    ["6000", "6 mil"],
    ["6 mil", "6 mil"],
    ["12500", "12,5 mil"],
    ["12,5 mil", "12,5 mil"],
    ["150000", "150 mil"],
    ["1500000", "1,5 milhão"],
    ["1,5 milhão", "1,5 milhão"],
  ];
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} → ${expected}`, () => {
      expect(formatSalesLabel(normalizeSales(input))).toBe(expected);
    });
  }
});
