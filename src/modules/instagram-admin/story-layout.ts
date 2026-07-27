/**
 * Shared Story layout constants (isomorphic — browser & Worker).
 *
 * SOURCE OF TRUTH for the 1080×1920 Story composition used by BOTH:
 *   · Manual publish  (src/routes/instagram.stories.tsx — HTMLCanvasElement)
 *   · Automatic cron  (src/modules/instagram-admin/compose.server.ts — pureimage)
 *
 * Any change here MUST keep both renderers pixel-parity aligned.
 * No runtime deps (no DOM, no Node, no WASM).
 */

export const STORY_W = 1080;
export const STORY_H = 1920;

// Overlay zones tuned to the reference template (1080×1920).
export const PROD_ZONE = { x: 180, y: 470, w: 720, h: 640 } as const;
export const TITLE_ZONE = { x: 90, y: 1130, w: 900, h: 170 } as const;
export const PRICE_BAR_ZONE = { x: 90, y: 1310, w: 900, h: 170 } as const;

// Title sizing: up to 2 lines, shrinks by 4px steps until it fits.
export const TITLE_FONT_MAX = 58;
export const TITLE_FONT_MIN = 34;
export const TITLE_FONT_STEP = 4;
export const TITLE_LINE_HEIGHT = 1.15;
export const TITLE_MAX_LINES = 2;
export const TITLE_MAX_WIDTH_PADDING = 40; // subtracted from TITLE_ZONE.w

// Price sizing (weights are informational; server has only Inter-800 available).
export const POR_FONT_SIZE = 56;
export const PRICE_FONT_SIZE_WITH_DE = 92;
export const PRICE_FONT_SIZE_NO_DE = 120;
export const DE_FONT_SIZE = 42;

// Vertical anchors inside PRICE_BAR_ZONE (matches manual canvas).
export const DE_BASELINE_OFFSET = 48;                    // deY = PRICE_BAR.y + 48
export const PRICE_CENTER_Y_OFFSET_WITH_DE = -55;        // centerY = PRICE_BAR.y + h - 55
export const PRICE_CENTER_Y_OFFSET_NO_DE_FROM_MID = 0;   // centerY = PRICE_BAR.y + h/2

export const PRICE_TEXT_COLOR = "#ffffff";
export const DEFAULT_TITLE_COLOR = "#111111";
export const DEFAULT_BG_COLOR = "#fde047";
export const DE_STRIKE_WIDTH = 4;

/**
 * Wrap `title` into ≤ TITLE_MAX_LINES using the caller-provided measurement
 * function. `measure(text, size)` MUST return the rendered pixel width at
 * `size` in the target runtime (canvas measureText or opentype getAdvanceWidth).
 * Shrinks font size until lines fit; hard-clamps at TITLE_FONT_MIN.
 */
export function wrapTitleLines(
  title: string,
  measure: (text: string, size: number) => number,
): { lines: string[]; size: number } {
  const maxW = TITLE_ZONE.w - TITLE_MAX_WIDTH_PADDING;
  const words = title.split(/\s+/).filter(Boolean);
  const wrapAt = (size: number): string[] => {
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (measure(test, size) > maxW && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  };

  let size = TITLE_FONT_MAX;
  let lines = wrapAt(size);
  while (lines.length > TITLE_MAX_LINES && size > TITLE_FONT_MIN) {
    size -= TITLE_FONT_STEP;
    lines = wrapAt(size);
  }
  lines = lines.slice(0, TITLE_MAX_LINES);
  return { lines, size };
}

export function formatBRL(n: number | null | undefined): string {
  if (n == null) return "";
  return `R$ ${Number(n).toFixed(2).replace(".", ",")}`;
}
