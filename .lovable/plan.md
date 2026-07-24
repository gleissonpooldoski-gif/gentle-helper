
## Objetivo
Criar um motor real de agendamento que dispara produtos pela instância `DIVULGA LINKS` respeitando janela de horário, intervalo, lojas ativas, ordem e loop.

## Estrutura

### 1. Banco de dados (migration)
- `automation_configs` — 1 linha por usuário/canal
  - `user_id`, `channel_id`, `hora_inicio` (time), `hora_fim` (time), `intervalo_min` (int), `lojas_ativas` (text[]: shopee, mercadolivre, magalu, amazon), `post_loop` (bool), `status` (idle | running | waiting | error | done), `current_index` (int), `next_run_at` (timestamptz), `last_error` (text), `last_sent_at`, `last_product_name`
- `automation_queue` — snapshot de produtos ativos
  - `id`, `config_id`, `order_index`, `product_id`, `store`, `title`, `caption`, `media_url`, `link`, `sent_count`
- `whatsapp_campaign_history` — histórico
  - conforme spec (product_id, product_name, store, group_id, group_name, instance_name, media_url, caption, status, sent_at, error_message)

Todas com RLS `auth.uid() = user_id`.

### 2. Server functions (`src/modules/automation/automation.functions.ts`)
- `getAutomationConfig({ channelId })` — carrega config + status
- `saveAutomationConfig({ channelId, horaInicio, horaFim, intervaloMin, lojasAtivas, postLoop })`
- `startAutomation({ channelId })` — monta queue a partir de `products` filtrando por `lojas_ativas`, seta `status=running`, calcula `next_run_at`
- `stopAutomation({ channelId })`
- `getAutomationStatus({ channelId })` — retorna status, próximo disparo, produto atual, último envio

### 3. Worker (endpoint público)
`src/routes/api/public/hooks/automation-tick.ts` (POST): 
1. Busca configs com `status='running'` e `next_run_at <= now()`
2. Para cada uma: verifica janela (hora atual entre início e fim); se fora, marca `waiting` e recalcula `next_run_at` para próxima abertura de janela
3. Dentro da janela: pega produto atual da fila, valida connectionState `DIVULGA LINKS`; se `open`, envia via `sendMedia` para cada grupo selecionado do canal, grava histórico
4. Avança `current_index`; se passou do fim: loop → volta para 0, senão marca `done`
5. Atualiza `next_run_at = now() + intervalo_min`

### 4. pg_cron
Job a cada minuto chamando `/api/public/hooks/automation-tick`.

### 5. UI — `src/routes/canais.$id.editar.tsx`
Atualizar painel "Frequência e Loop" existente:
- Inputs controlados: hora início/fim, intervalo, checkboxes de lojas, toggle loop
- Botões: Salvar, Iniciar/Parar
- Card de status: badge (Rodando/Aguardando/Erro), próximo disparo, produto atual, último envio

## Detalhes técnicos
- Cliente WhatsApp: reutilizar `evolutionProvider.sendMedia` e `connectionState` já existentes
- Renderização: reutilizar `renderPost` do módulo de posts
- Grupos: usar `whatsapp_group_selections` ativos do canal
- Timezone: `America/Sao_Paulo` para comparações de janela

## Fora de escopo
- Não altera layout de posts, integração Shopee, Evolution API, instância existente
