import type { Marketplace, ProductPayload } from "../contracts/product.schema";
import type { ResilientHttpClient } from "../resilience/http-client";

export interface AdapterContext {
  http: ResilientHttpClient;
  /** Lazy-loaded Playwright browser para fallback headless. */
  getHeadless: () => Promise<HeadlessBrowser>;
}

export interface HeadlessBrowser {
  render(url: string, opts?: { waitFor?: string; timeoutMs?: number }): Promise<string>;
}

export abstract class BaseAdapter {
  abstract readonly marketplace: Marketplace;

  /**
   * Estratégia em cascata:
   *  1. API oficial / endpoint interno (JSON) — mais rápido e estável
   *  2. HTML estático + Cheerio
   *  3. Renderização headless (Playwright)
   * Cada adapter concreto decide quais camadas usar.
   */
  abstract extract(url: string, ctx: AdapterContext): Promise<ProductPayload>;
}
