
# Auditoria Completa do Divulga Links

Escopo: só o que existe hoje no projeto. Sem Facebook, sem YouTube, sem multi-projeto, sem features novas.

## Módulos que serão auditados

1. **WhatsApp / Automação de envios** (Evolution API, `automation_configs`, `automation-tick`, filas, dedup por instância/grupo)
2. **Instagram Admin** (Stories cron, webhook Meta, InstaBotHelp, publicação de posts)
3. **Afiliados** (Shopee Open API v2, Mercado Livre OAuth, Magalu, transformação de links)
4. **Captura de produtos** (webhook Evolution, `capture.server.ts`, enrich de imagem/preço, `product_price_history`)
5. **Site / Vitrine pública** (`g/$slug`, `site_configs`, ordenação, limite)
6. **Relatórios** (`shopee_conversions`, filtros, CSV export, gráficos)
7. **Dashboard e Layout de Post** (variáveis, cabeçalhos dinâmicos, header discount vs normal)
8. **Banco / RLS / Índices** (grants, políticas, constraints, índices em queries quentes)
9. **Cron jobs `pg_cron`** (schedule, secrets, endpoints chamados)
10. **Segurança** (secrets, endpoints `/api/public/*`, HMAC, `requireSupabaseAuth`)

## Como vou entregar

Uma rodada por módulo, nesta ordem (priorizado por impacto atual):

1. WhatsApp/Automação
2. Instagram Stories/Admin
3. Captura + Afiliados
4. Banco/RLS/Índices + Cron
5. Relatórios + Site + Dashboard
6. Segurança (varredura final)

Em cada rodada eu:
- Leio o código do módulo
- Rodo queries de sanidade no banco quando fizer sentido
- Escrevo um **relatório curto** (problemas encontrados + severidade + causa raiz)
- **Peço aprovação** antes de aplicar qualquer correção
- Aplico só o que você aprovar

Nada é reescrito "por estética". Só mexo no que estiver **quebrado, inseguro ou instável**.

## Regras que vou seguir

- Não crio nada novo (sem features, sem tabelas novas exceto índice/constraint pra corrigir bug).
- Não toco em módulo que não está na rodada atual.
- Se achar algo fora do escopo (ex: bug no site enquanto audito WhatsApp), eu **anoto e sigo** — só volto depois.
- Toda correção que mexer no banco passa por migração aprovada.

## Primeira rodada — WhatsApp/Automação

Foco imediato porque é o problema ativo que você relatou (instância disparando 3x):

- Mapear `automation_configs` ativos e a regra "1 instância = 1 grupo por vez"
- Revisar `automation-tick.ts`: locking, dedup, ordem de envio, fanout
- Revisar `sendWhatsAppProduct`: retry, circuit breaker, tratamento de 502
- Revisar constraint em `automation_configs` (deveria ter unique em `(user_id, instance_id, group_id)` quando ativo?)
- Rodar query pra achar duplicatas / configs órfãs / configs sem `instance_id`

Ao final da rodada 1, eu te mando o relatório e as correções propostas pra aprovar.

**Confirma que posso começar pela rodada 1 (WhatsApp)?**
