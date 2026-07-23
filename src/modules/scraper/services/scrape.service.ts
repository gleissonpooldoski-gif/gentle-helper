import type { Queue } from "bullmq";

import {
  ScrapeJobInputSchema,
  type ScrapeJobInput,
  type ScrapeJobResult,
} from "../contracts/product.schema";
import { detectMarketplace, stripTracking } from "../utils/url";
import { priorityToBullMq } from "../queue/scrape-queue";

export class ScrapeService {
  constructor(private readonly queue: Queue<ScrapeJobInput, ScrapeJobResult>) {}

  /**
   * Enfileira uma extração. Usa `canonicalUrl` como jobId para deduplicar
   * requisições concorrentes sobre o mesmo produto (idempotência barata).
   */
  async enqueue(rawInput: unknown): Promise<{ jobId: string; marketplace: string }> {
    const input = ScrapeJobInputSchema.parse(rawInput);
    const marketplace = detectMarketplace(input.url);
    if (!marketplace) throw new UnsupportedMarketplaceError(input.url);

    const canonical = stripTracking(input.url);
    const jobId = `${marketplace}:${hash(canonical)}`;

    await this.queue.add(
      "scrape",
      { ...input, url: canonical },
      { jobId: input.forceRefresh ? undefined : jobId, priority: priorityToBullMq(input.priority) },
    );

    return { jobId, marketplace };
  }

  async getResult(jobId: string): Promise<ScrapeJobResult | { status: "pending" }> {
    const job = await this.queue.getJob(jobId);
    if (!job) return { status: "pending" };
    const state = await job.getState();
    if (state === "completed") return job.returnvalue;
    if (state === "failed") {
      return { status: "error", code: "unknown", message: job.failedReason ?? "failed" };
    }
    return { status: "pending" };
  }
}

export class UnsupportedMarketplaceError extends Error {
  constructor(url: string) {
    super(`Marketplace não suportado: ${url}`);
    this.name = "UnsupportedMarketplaceError";
  }
}

/** FNV-1a 32-bit, suficiente para chave de dedupe. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}
