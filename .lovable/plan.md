# Instagram Admin — Sistema de Automação Completo

Amplia o módulo `/instagram/*` (conta única já conectada) para automação ponta-a-ponta usando Meta Graph API v21. Reaproveita `instagram_settings`, `instagram_logs`, `instagram_comments`, `instagram_automations` já existentes. Nada de OAuth, Facebook Login ou múltiplas contas.

## O que será entregue

### 1. Diagnóstico e validação (Instagram > Diagnóstico)
- Painel que roda ao abrir qualquer aba do módulo.
- Verifica em tempo real: Access Token válido, Instagram Business ID, Facebook Page, Webhook (via `subscribed_apps`), permissões (via `debug_token`), expiração do token, último Story, última DM, último comentário.
- Reaproveita a lógica de `testConnection` já criada (agora com `pageName`, `webhookActive`, `capabilities`).

### 2. Publicações (Instagram > Publicações) — já existe
- Manter a página atual (feed real da Graph API) e adicionar botão Atualizar (invalida query).

### 3. Stories (Instagram > Stories)
- Selecionar produto da tabela `products` (equivalente a `affiliate_products` aqui).
- Escolher template salvo → renderiza PNG server-side com placeholders `{{product_image}}`, `{{title}}`, `{{price}}`, `{{original_price}}`, `{{discount}}`, `{{store}}`, `{{affiliate_link}}`.
- Publica via `/media` + `/media_publish` (STORIES).
- Registra em `instagram_campaigns` (nova tabela): story_id, product_id, template_id, keyword, message, status, published_at.

### 4. Editor de templates (Instagram > Templates)
- Editor visual Fabric.js 1080×1920.
- Elementos: logo, imagem do produto, textos, preço, desconto, formas.
- Serializa `canvas.toJSON()` na tabela `instagram_story_templates` (já existe — adiciono coluna `fabric_json jsonb`).
- Múltiplos templates por conta; um marcado como padrão.

### 5. Automações por palavra-chave (Instagram > Automações) — já existe
- Ampliar `instagram_automations` com `product_id uuid` opcional e mensagens com placeholder `{{affiliate_link}}`.
- Aplicadas a comentários E respostas de Stories.

### 6. Webhook `/api/public/meta/webhook` — já existe
- Estender para processar `story_insights`/`messages` (Story replies) além de comentários e DMs.
- Gatilho por palavra-chave (LINK, PROMOÇÃO, OFERTA, CUPOM, DESCONTO): busca a campanha ligada ao Story e envia DM com `affiliate_link` do produto.
- Comentários com "link", "promo", "cupom" → responde no comentário e opcionalmente envia DM.
- Todos os eventos gravam em `instagram_logs` com `type`, `payload`, `latency_ms`.

### 7. Inbox de DMs (Instagram > Mensagens) — já existe listagem
- Ampliar: mostrar foto/nome/mensagem/data, painel de conversa e responder em tempo real via `/{ig-id}/messages`.

### 8. Dashboard (Instagram > Dashboard)
- Cards do dia: Stories publicados, comentários respondidos, DMs enviadas, automações executadas, taxa de resposta, top produtos enviados.
- Fonte: agregações sobre `instagram_campaigns` + `instagram_logs` + `instagram_comments`.

### 9. Segurança e qualidade
- Access Token permanece criptografado (AES-256-GCM já implementado).
- Toasts de sucesso/erro, loaders, retry com backoff exponencial em chamadas Graph (3 tentativas em 5xx/#4/#17).
- Logs completos com duração.

## Detalhes técnicos

### Banco (uma migration)
- `instagram_campaigns` (id, user_id, story_id, product_id, template_id, keyword, message, status, published_at, created_at) + RLS + GRANT.
- `instagram_story_templates`: adicionar `fabric_json jsonb`, `is_default boolean`.
- `instagram_logs`: adicionar `latency_ms int`.
- `instagram_automations`: adicionar `product_id uuid`, `scope text default 'comment'` (comment|story_reply|both).

### Backend (server functions em `src/modules/instagram-admin/`)
- `graph.server.ts`: adicionar `sendDirectMessage` (já existe), `getMediaInsights`, `getRecentDMs`, wrapper com retry.
- `story-render.server.ts`: renderiza template usando `@napi-rs/canvas` (compatível com Workers) → PNG → upload para Storage bucket público → devolve URL pra Graph.
- `campaigns.functions.ts`: `publishStoryCampaign({productId, templateId, keyword, message})`, `listCampaigns`, `getDashboardStats`.
- `templates.functions.ts`: CRUD dos templates Fabric.
- `webhook`: reescrever handler para roteamento por tipo (comment / message / story_reply) + engine de matching de palavra-chave + envio de DM automatizada.

### Frontend (`src/routes/instagram.*.tsx`)
- Novas rotas: `instagram.dashboard.tsx`, `instagram.templates.tsx`, `instagram.diagnostico.tsx`.
- Stories page: seletor de produto + seletor de template + preview + botão publicar.
- Templates page: canvas Fabric.js com toolbar (adicionar texto/imagem/forma, cores, fontes) e save.
- Layout `instagram.tsx`: sub-nav com Dashboard, Publicações, Stories, Templates, Automações, Mensagens, Comentários, Diagnóstico, Configurações.

### Dependências novas
- `fabric` (editor)
- `@napi-rs/canvas` (render PNG server-side, compatível com Cloudflare Workers via wasm)

## Fora de escopo
- OAuth / Facebook Login / múltiplas contas.
- Agendamento recorrente de Stories (já existe `instagram_story_schedule`; não será mexido nesta entrega salvo consumo).
- Editor de vídeo / Reels.

## Ordem de execução
1. Migration (tabelas/colunas + RLS + GRANT).
2. Backend: render de Story, campanhas, webhook expandido, dashboard stats.
3. Frontend: Dashboard, Stories (publicar), Templates (editor), Diagnóstico; ajustes em Automações e Mensagens.
4. Teste ponta-a-ponta: publicar Story → responder no Instagram → confirmar DM automática.

Aprovando, executo tudo em sequência.