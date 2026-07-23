import { Queue, QueueEvents, Worker, type JobsOptions } from "bullmq";
import IORedis, { type Redis } from "ioredis";

import type { ScrapeJobInput, ScrapeJobResult } from "../contracts/product.schema";

export const SCRAPE_QUEUE_NAME = "scrape-products";

let connection: Redis | undefined;
export function getRedis(): Redis {
  if (!connection) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL não configurado");
    connection = new IORedis(url, { maxRetriesPerRequest: null });
  }
  return connection;
}

export function createScrapeQueue(): Queue<ScrapeJobInput, ScrapeJobResult> {
  return new Queue<ScrapeJobInput, ScrapeJobResult>(SCRAPE_QUEUE_NAME, {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: Number(process.env.SCRAPER_MAX_ATTEMPTS ?? 5),
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: { age: 3_600, count: 1_000 },
      removeOnFail: { age: 24 * 3_600 },
    },
  });
}

export function createScrapeQueueEvents(): QueueEvents {
  return new QueueEvents(SCRAPE_QUEUE_NAME, { connection: getRedis() });
}

export function priorityToBullMq(p: ScrapeJobInput["priority"]): JobsOptions["priority"] {
  return p === "high" ? 1 : p === "normal" ? 5 : 10;
}

export type { Worker };
