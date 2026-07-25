# Plano — Fluidez + Robustez Total do SaaS

São 20 melhorias, agrupadas em 3 fases entregáveis. Cada fase é auto-contida: se algo quebrar no meio, o sistema continua funcionando com as anteriores aplicadas.

## Fase 1 — Fluidez (percepção instantânea)

**Objetivo:** navegação e ações parecerem instantâneas, mesmo com >10k produtos.

1. **Índices compostos no banco** — cobrir os padrões de leitura mais quentes:
   - `products (user_id, source_group_jid, availability, affiliate_link)`
   - `products (user_id, channel_id, platform, availability, created_at DESC)`
   - `whatsapp_campaign_history (config_id, sent_at DESC)`
   - `automation_group_sends (config_id, product_id)`
2. **Hook `useDebounced`** aplicado em todas as barras de busca (dashboard, vitrine, relatórios, produtos do grupo).
3. **Skeletons** substituindo spinners em: dashboard, `canais.$id.editar`, relatórios, `instagram.stories`.
4. **Optimistic UI** em: toggle automação, ativar/pausar loop, selecionar grupo, salvar layout.
5. **Virtualização** (`@tanstack/react-virtual`) no modal de produtos do grupo quando >200 itens.

## Fase 2 — Robustez (zero erro operacional)

**Objetivo:** falhas externas (Evolution/Meta caem) não causam prejuízo — sistema se recupera sozinho.

6. **Helper `retryWithBackoff`** — retry exponencial (500ms → 1s → 2s → 4s) em toda chamada Evolution/Meta, com jitter e cap.
7. **Circuit breaker** no `automation-tick`: se Evolution retorna 5xx 3× seguidas na mesma instância, pausa aquela config por 5min ao invés de queimar tentativas.
8. **Dead-letter queue** — tabela `automation_failures` (config_id, product_id, error, attempt_count, next_retry_at). Card no painel "Falhas recentes" com botão "Reenviar em lote".
9. **Idempotência de webhooks** — tabela `webhook_events (event_id UNIQUE, provider, received_at)`. Todo webhook Meta/Evolution/Shopee verifica antes de processar.
10. **Rate-limit hard por instância WhatsApp** — máximo N mensagens/min por instância (config global, default 20/min). Bloqueia envio se ultrapassar, protege de ban.
11. **Validação HEAD da imagem** antes de enviar via WhatsApp — se URL 404/timeout, envia sem mídia ao invés de falhar o post inteiro.

## Fase 3 — Observabilidade + Auto-Recuperação

**Objetivo:** você fica sabendo dos problemas antes do cliente reclamar — e o sistema tenta se consertar.

12. **Tabela `system_logs`** (level, module, user_id, message, meta jsonb, created_at) com índice por nível+data. Todo `console.error` do server passa a gravar aqui.
13. **Renovação proativa de tokens** — job diário (pg_cron 4h da manhã) que refresha tokens Meta/ML que expiram em <48h.
14. **Painel `/saude` — Health Dashboard** com uma única tela mostrando:
    - Status Evolution (ping)
    - Instâncias WhatsApp conectadas/desconectadas
    - Tokens Meta/ML e validade
    - Últimas 20 falhas do `automation_failures`
    - Última execução do `pg_cron` e do `automation-tick`
    - Taxa de sucesso 24h
15. **Alertas via WhatsApp Admin** — quando taxa de erro >10% em 15min, ou instância cai, mandar DM pro número do admin da conta usando a própria Evolution.

## O que NÃO entra agora (débito técnico consciente)

Deixo pra depois porque exigem refactor extenso e o risco é maior que o ganho imediato:

- Consolidação `whatsapp/` + `channel_whatsapp_*` (3 tabelas duplicadas) → precisa migração de dados cuidadosa.
- Centralização de DTOs em `src/types/` → refactor amplo, sem ganho funcional.
- Suite E2E Playwright completa → precisa infraestrutura de CI dedicada.
- Realtime nos status (Supabase Realtime) → substituído por polling leve de 30s no `/saude`, cobre o caso sem custo extra de billing.

## Detalhes técnicos

**Ordem estrita das fases:** F1 primeiro porque índices desbloqueiam performance da F2/F3. F2 antes de F3 porque a `automation_failures` alimenta o Health Dashboard. F3 depende de tudo anterior.

**Migrações previstas:** 3 migrations aprovadas separadamente (uma por fase).

**Impacto no código existente:**
- Novos arquivos: `src/hooks/use-debounced.ts`, `src/components/ui/skeleton-page.tsx`, `src/lib/retry.ts`, `src/lib/circuit-breaker.ts`, `src/lib/logger.server.ts`, `src/routes/saude.tsx`, `src/modules/failures/failures.functions.ts`, `src/modules/health/health.functions.ts`.
- Edits em: `automation-tick.ts` (retry + circuit breaker + failures), webhooks Meta/Evolution (idempotência), `whatsapp-sender.ts` (rate-limit + HEAD check), rotas com search (debounce), rotas com loader pesado (skeletons).

**Estimativa:** F1 ≈ 25 min, F2 ≈ 40 min, F3 ≈ 30 min de execução em sequência.

## Aprovação

Confirma que quer as **3 fases seguidas** (executo tudo em série), ou prefere que eu pare após cada fase pra você validar antes da próxima?
