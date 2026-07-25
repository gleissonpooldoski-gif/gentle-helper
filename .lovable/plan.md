# Módulo Instagram — Automação de Vendas

Objetivo: transformar a aba **Instagram** (dentro de `canais/$id/editar`) em uma central de automação real usando **Instagram Graph API**, sem tocar em cores, componentes ou layout existente. Apenas conectar botões, campos e cards já presentes às novas funcionalidades.

## 1. Credenciais Meta (pré-requisito)

Vou solicitar via `add_secret`:
- `META_APP_ID` — App ID do Facebook Developers
- `META_APP_SECRET` — App Secret
- `META_WEBHOOK_VERIFY_TOKEN` — string qualquer para verificação do webhook
- `INSTAGRAM_OAUTH_REDIRECT` — será fixado como `https://<projeto>.lovable.app/api/public/instagram/callback`

O usuário precisa habilitar no painel Meta: **instagram_basic, instagram_manage_comments, instagram_manage_messages, instagram_content_publish, pages_manage_metadata, pages_read_engagement, pages_messaging**.

## 2. Banco de dados (migração única)

Novas tabelas (todas com RLS `auth.uid() = user_id` + GRANT authenticated/service_role, isolamento por `channel_id` quando aplicável):

- `instagram_connections` — id, user_id, channel_id, instagram_account_id, facebook_page_id, username, name, profile_picture, followers_count, follows_count, media_count, access_token_ciphertext, token_expires_at, status (`connected|disconnected|expired|error`), last_error, timestamps.
- `instagram_keywords` — id, user_id, channel_id, keyword, action (`send_link`), active, comment_reply_enabled, comment_reply_text, timestamps.
- `instagram_story_templates` — id, user_id, channel_id, image_url, title_color, price_color, timestamps.
- `instagram_posts` — id, user_id, channel_id, product_id, instagram_media_id, kind (`post|story`), status (`pending|published|failed`), caption, error_message, published_at, timestamps.
- `instagram_story_schedule` — id, user_id, channel_id, days int[] (0-6), hours int[] (0-23), template_id, active, last_run_at, timestamps.
- `instagram_events` — id, user_id, connection_id, kind (`comment|story_reply|dm_sent|click|follower_delta`), payload jsonb, product_id, created_at (para relatórios).

Tokens armazenados via AES-GCM reutilizando helper existente (`shopee-config.server.ts` style) com nova chave `INSTAGRAM_TOKEN_ENC_KEY` (gerada via `generate_secret`).

## 3. OAuth Meta

- Server route público **`src/routes/api/public/instagram/callback.ts`**: recebe `code`, troca por short-lived → long-lived token (60 dias), lista páginas Facebook do usuário, encontra IG business account vinculada, salva conexão criptografada, redireciona para `/canais/$id/editar?tab=instagram&ig=connected`.
- Server fn `startInstagramOAuth({ channelId })` → retorna URL de autorização Meta.
- Server fn `disconnectInstagram({ channelId })` → apaga conexão + revoga token.
- Refresh automático de token quando `token_expires_at < now()+7d` (chamado no worker).

## 4. Webhook Instagram

- **`src/routes/api/public/webhooks/instagram.ts`**:
  - `GET` → responde `hub.challenge` se `hub.verify_token === META_WEBHOOK_VERIFY_TOKEN`.
  - `POST` → valida assinatura HMAC-SHA256 (`x-hub-signature-256` com `META_APP_SECRET`), processa eventos:
    - `comments` → match keyword → responde comentário (se habilitado) + envia DM com produto.
    - `messages` (story_reply) → mesmo fluxo.
- Handler chama `handleInstagramTrigger()` (server helper) que:
  1. Busca keyword ativa que casa (case-insensitive, whole word).
  2. Escolhe produto relacionado do canal (pode ser o mais recente `active`; se comentário/story tem `media_id` vinculado a um `instagram_posts.product_id`, usa esse).
  3. Envia DM via Graph `POST /me/messages` com template `button` contendo `web_url` = link afiliado + texto "VER PARA COMPRAR".
  4. Grava `instagram_events`.

## 5. Publicação de Posts e Stories

Server fns:
- `publishInstagramPost({ channelId, productId, caption })` — cria container `/{ig-user-id}/media` (image_url = imagem do produto) e publica com `/media_publish`.
- `publishInstagramStory({ channelId, productId, templateId })` — renderiza template (imagem + variáveis `{title} {price} {price_original} {discount} {store} {link}` via canvas server-side usando `@napi-rs/canvas`? — **alternativa Worker-safe**: gerar SVG/HTML + usar imagem base do template diretamente com overlay via Graph story caption; sem canvas nativo). Uso um render **HTML→imagem via API pública** (`https://api.htmlcsstoimage.com`) evitado; em vez disso gero uma composição usando imagem do template já pronta, aplico texto via **Instagram media caption** (stories aceitam sticker de texto apenas via app oficial). Solução prática: publicar a imagem do produto como story e adicionar `caption` com variáveis substituídas; a "cor do título/preço" fica salva para uso futuro em renderizador dedicado.
- Registra em `instagram_posts`.

## 6. Agendamento

Reaproveitar o worker existente (`automation-tick` em pg_cron). Adicionar server route **`src/routes/api/public/hooks/instagram-tick.ts`** que:
- Refresh de tokens próximos do vencimento.
- Executa schedules de story ativos cujo dia/hora atual bate.
- Publica próximo produto do canal ainda não postado hoje.

Nova entrada em `pg_cron` chamando esse endpoint a cada minuto.

## 7. UI (sem alterar layout)

Localizar componente atual (`InstagramPanel` na aba dentro de `canais.$id.editar.tsx`) e apenas:
- Ligar botão **Conectar Instagram** → chama `startInstagramOAuth` e abre nova aba.
- Card "Conta Vinculada" → carrega via `getInstagramConnection({ channelId })`.
- Lista de palavras-chave → CRUD via `list/save/deleteInstagramKeyword`.
- Toggle "Desativar resposta no comentário" → salva em `instagram_keywords.comment_reply_enabled`.
- Upload template → usa bucket `site-logos` (ou novo `instagram-templates`) via `supabase.storage`.
- Seletor de dias/horas → salva `instagram_story_schedule`.
- Toggle "Post automático" e "Crescimento de seguidores" → gravam flags na `instagram_connections` (colunas extras `auto_post_enabled`, `growth_enabled`).

Nenhuma mudança visual. Apenas `onClick`, `value/onChange`, queries e mutations.

## 8. Relatórios

Server fn `getInstagramStats({ channelId, from, to })` agregando `instagram_events` + `instagram_posts` para: stories publicados, posts publicados, comentários, DMs enviadas, cliques (a partir de `kind='click'` quando disponível via redirect), conversões (join com `shopee_conversions` por período).

Reaproveitar página Relatórios com filtro de plataforma `instagram` (já implementado).

## 9. Detalhes técnicos

- Fetchs à Graph API usam `https://graph.facebook.com/v21.0/...` com `access_token` descriptografado apenas dentro dos handlers server.
- Todos os writes validam ownership via `requireSupabaseAuth`.
- Nunca envio link cru: sempre passo pelo `enforceAffiliateLink` (helper existente em `src/lib/affiliate-linker.ts`).
- Webhook público valida HMAC antes de qualquer processamento; nunca retorna PII.

## 10. Sequência de execução

1. Migração (tabelas + RLS + GRANTS).
2. Solicitar secrets Meta.
3. Helpers: crypto de token, cliente Graph API.
4. OAuth (server fn + callback route).
5. Webhook route.
6. Server fns de keywords, templates, schedule, publish, stats.
7. Wiring da UI existente (sem alterar layout).
8. Cron `instagram-tick`.
9. Teste manual (dev) + verificação de tipos.

## Confirmação necessária

Para prosseguir preciso confirmar:
- Você **já tem um App Meta** aprovado com Instagram Graph API (com Advanced Access nas permissões acima)? Sem isso, apenas contas de teste conseguem receber DMs/webhooks.
- Posso adicionar os secrets `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` (após sua confirmação, abro o formulário seguro)?
- Confirma que o render de "cor do título/preço" no story pode ficar como **metadata salva** neste passo, e a composição visual real do sticker vem em uma segunda etapa (limitação da Graph API — stickers de texto só via app oficial; a Graph publica imagem + caption)?

Ao confirmar, executo a implementação completa.
