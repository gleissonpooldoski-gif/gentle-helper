import { describe, it, expect } from "vitest";
import {
  STORY_W, STORY_H,
  PROD_ZONE, TITLE_ZONE, PRICE_BAR_ZONE,
  TITLE_FONT_MAX, TITLE_FONT_MIN,
  POR_FONT_SIZE, PRICE_FONT_SIZE_WITH_DE, PRICE_FONT_SIZE_NO_DE, DE_FONT_SIZE,
  DE_BASELINE_OFFSET, PRICE_CENTER_Y_OFFSET_WITH_DE,
  wrapTitleLines, formatBRL,
} from "../story-layout";

// Fake measurer: 1 char = charWidth px at any size proportional to size.
// Mimics monospace so tests are deterministic across runtimes.
const fakeMeasure = (charWidth = 30) => (text: string, size: number) =>
  text.length * (charWidth * (size / TITLE_FONT_MAX));

describe("story-layout — canonical constants (must not drift)", () => {
  it("canvas is 1080x1920", () => {
    expect(STORY_W).toBe(1080);
    expect(STORY_H).toBe(1920);
  });
  it("product zone matches manual canvas", () => {
    expect(PROD_ZONE).toEqual({ x: 180, y: 470, w: 720, h: 640 });
  });
  it("title zone matches manual canvas", () => {
    expect(TITLE_ZONE).toEqual({ x: 90, y: 1130, w: 900, h: 170 });
  });
  it("price bar zone matches manual canvas", () => {
    expect(PRICE_BAR_ZONE).toEqual({ x: 90, y: 1310, w: 900, h: 170 });
  });
  it("font sizes match manual canvas", () => {
    expect(POR_FONT_SIZE).toBe(56);
    expect(PRICE_FONT_SIZE_WITH_DE).toBe(92);
    expect(PRICE_FONT_SIZE_NO_DE).toBe(120);
    expect(DE_FONT_SIZE).toBe(42);
  });
  it("vertical anchors match manual canvas", () => {
    expect(DE_BASELINE_OFFSET).toBe(48);
    expect(PRICE_CENTER_Y_OFFSET_WITH_DE).toBe(-55);
  });
});

describe("wrapTitleLines", () => {
  it("short title stays 1 line at max size", () => {
    const { lines, size } = wrapTitleLines("Kit brinquedo", fakeMeasure(20));
    expect(lines).toHaveLength(1);
    expect(size).toBe(TITLE_FONT_MAX);
  });
  it("wraps into <= 2 lines", () => {
    const t = "Kit Brinquedo Educativo Montessori Peças Madeira Coloridas Infantil";
    const { lines } = wrapTitleLines(t, fakeMeasure(35));
    expect(lines.length).toBeLessThanOrEqual(2);
  });
  it("shrinks font when title still overflows", () => {
    const huge = "Palavra ".repeat(30).trim();
    const { size } = wrapTitleLines(huge, fakeMeasure(50));
    expect(size).toBeLessThan(TITLE_FONT_MAX);
    expect(size).toBeGreaterThanOrEqual(TITLE_FONT_MIN);
  });
});

describe("formatBRL", () => {
  it("formats brazilian currency", () => {
    expect(formatBRL(28)).toBe("R$ 28,00");
    expect(formatBRL(1234.5)).toBe("R$ 1234,50");
  });
  it("returns empty on null/undefined", () => {
    expect(formatBRL(null)).toBe("");
    expect(formatBRL(undefined)).toBe("");
  });
});
