import { Worker } from "bullmq";

import {
  ProductPayloadSchema,
  type ScrapeJobInput,
  type ScrapeJobResult,
} from "../contracts/product.schema";
import { detectMarketplace } from "../utils/url";
import { getAdapter } from "../adapters";
import type { HeadlessBrowser } from "../adapters/base.adapter";
import {
  ResilientHttpClient,
  RotatingProxyProvider,
  ScrapeError,
} from "../resilience/http-client";
import { SCRAPE_QUEUE_NAME, getRedis } from "../queue/scrape-queue";

/**
 * Ponto de entrada do worker. Rodar como `node dist/modules/scraper/workers/scrape.worker.js`
 * (ou via tsx em dev). Escala horizontalmente: N processos, cada um com concorrência interna.
 */
export function startScrapeWorker(options: {
  proxies?: string[];
  concurrency?: number;
  headlessFactory?: () => Promise<HeadlessBrowser>;
}) {
  const http = new ResilientHttpClient(new RotatingProxyProvider(options.proxies ?? []));
  const getHeadless =
    options.headlessFactory ??
    (async () => {
      // Import lazy para não carregar Playwright quando não é necessário.
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ headless: true });
      const impl: HeadlessBrowser = {
        async render(url, opts) {
          const ctx = await browser.newContext({ locale: "pt-BR" });
          const page = await ctx.newPage();
          try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: opts?.timeoutMs ?? 20_000 });
            if (opts?.waitFor) await page.waitForSelector(opts.waitFor, { timeout: opts.timeoutMs });
            return await page.content();
          } finally {
            await ctx.close();
          }
        },
      };
      return impl;
    });

  return new Worker<ScrapeJobInput, ScrapeJobResult>(
    SCRAPE_QUEUE_NAME,
    async (job: { data: ScrapeJobInput }): Promise<ScrapeJobResult> => {
      const marketplace = detectMarketplace(job.data.url);
      if (!marketplace) {
        return { status: "error", code: "unsupported_marketplace", message: job.data.url };
      }
      try {
        const raw = await getAdapter(marketplace).extract(job.data.url, { http, getHeadless });
        const product = ProductPayloadSchema.parse(raw); // valida antes de publicar
        return { status: "ok", product };
      } catch (err) {
        if (err instanceof ScrapeError) {
          return { status: "error", code: err.code, message: err.message };
        }
        throw err; // deixa BullMQ contabilizar como falha e reter
      }
    },
    {
      connection: getRedis(),
      concurrency: options.concurrency ?? Number(process.env.SCRAPER_CONCURRENCY ?? 8),
    },
  );
}
