# Smart Scraper & API Engine

Microsserviço de **ingestão e normalização de produtos** de marketplaces brasileiros
(Shopee, Amazon, Mercado Livre, Magalu, AliExpress).

## Runtime

Este módulo **não roda em Cloudflare Workers** (o front-end atual roda). Ele é um
processo Node.js independente porque precisa de:

- Playwright/Chromium para fallback headless
- Conexões TCP persistentes (Redis/BullMQ)
- Rotação de proxies residenciais
- Filas com concorrência controlada e retentativas

Deploy sugerido: container Docker em Fly.io / Railway / Render / ECS, com Redis
gerenciado (Upstash, Redis Cloud) e um pool de proxies (BrightData, Oxylabs, IPRoyal).

## Camadas

```text
HTTP  ─▶  Controller  ─▶  Service  ─▶  Queue (BullMQ)  ─▶  Worker  ─▶  Adapter[marketplace]
                                                                          │
                                                                          ├─ API oficial (quando existir)
                                                                          ├─ HTTP + Cheerio (rápido)
                                                                          └─ Playwright headless (fallback)
```

- **Controller**: valida entrada, enfileira job, devolve `jobId`.
- **Service**: orquestra detecção de marketplace, cache e políticas.
- **Queue**: BullMQ + Redis, retries com backoff exponencial, DLQ.
- **Worker**: consome jobs, chama o adapter correto, publica `ProductPayload`.
- **Adapters**: um por marketplace, isolam a estratégia de extração.
- **Resilience**: cliente HTTP com rotação de UA, proxies e circuit breaker.

## Contrato de saída

Todo adapter retorna um `ProductPayload` (ver `contracts/product.schema.ts`),
validado por Zod antes de ser publicado no barramento de eventos que alimenta o
banco e o pipeline de IA.

## Variáveis de ambiente

```
REDIS_URL=redis://...
PROXY_LIST_URL=https://provider/rotating.txt   # opcional
PROXY_USER=...
PROXY_PASS=...
SCRAPER_CONCURRENCY=8
SCRAPER_MAX_ATTEMPTS=5
```
