import type { ScrapeService, UnsupportedMarketplaceError } from "../services/scrape.service";

/**
 * Controller HTTP framework-agnóstico. Fino de propósito:
 * apenas valida entrada, delega no service e formata a resposta.
 * Pode ser plugado em Fastify, Express, Hono ou uma rota de API.
 */
export class ScrapeController {
  constructor(private readonly service: ScrapeService) {}

  /** POST /scrape  { url, priority?, forceRefresh?, userId? } */
  async enqueue(body: unknown): Promise<HttpResult> {
    try {
      const { jobId, marketplace } = await this.service.enqueue(body);
      return { status: 202, body: { jobId, marketplace } };
    } catch (err) {
      if ((err as UnsupportedMarketplaceError).name === "UnsupportedMarketplaceError") {
        return { status: 422, body: { error: "unsupported_marketplace", message: (err as Error).message } };
      }
      if ((err as { name?: string }).name === "ZodError") {
        return { status: 400, body: { error: "invalid_input", details: err } };
      }
      return { status: 500, body: { error: "internal_error" } };
    }
  }

  /** GET /scrape/:jobId */
  async result(jobId: string): Promise<HttpResult> {
    const result = await this.service.getResult(jobId);
    return { status: 200, body: result };
  }
}

export interface HttpResult {
  status: number;
  body: unknown;
}
