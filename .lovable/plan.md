# Instagram Admin (Meta Graph API) — conta única

Substitui o fluxo OAuth atual por uma configuração manual global (uma única conta Instagram gerenciada pelo admin do SaaS). Nenhum "Login com Facebook" será usado.

## Banco de dados (Lovable Cloud)

Migração nova:

- `instagram_settings` (linha única, singleton por `id = 'default'`)
  - `instagram_business_id`, `facebook_page_id`, `access_token_ciphertext` (AES-256-GCM, reusa `INSTAGRAM_TOKEN_ENC_KEY`)
  - `created_at`, `updated_at`
  - RLS: apenas `admin` (via `has_role`) pode ler/gravar. Service role para servidores.
- `instagram_comments`
  - `comment_id` (unique), `media_id`, `username`, `comment`, `reply`, `replied_at`, `created_at`
- `instagram_automations`
  - `keyword`, `message`, `enabled`, timestamps
  - Escopo global (sem `user_id`, gerido só por admin)
- `instagram_logs`
  - `type`, `payload jsonb`, `created_at`
- Papel `admin` reaproveitando o padrão `user_roles` (criar se ainda não existir).

Todas as tabelas com `GRANT` + RLS + trigger `updated_at`.

## Backend (server functions + rota pública)

Novo módulo `src/modules/instagram-admin/`:

- `settings.server.ts` — helper `getSettings()` que decripta o token, cache em memória do worker.
- `graph.server.ts` — chamadas Graph API (test connection, publish story, list comments, reply, list conversations, send DM). Reusa util `gfetch` do `instagram-graph.server.ts`.
- `services/`
  - `InstagramService` — CRUD `instagram_settings`, `testConnection`.
  - `InstagramStoryService` — `publishStory({ imageUrl, caption })`.
  - `InstagramCommentService` — `listComments`, `reply`, persistir em `instagram_comments`.
  - `InstagramMessageService` — `listConversations`.
  - `InstagramAutomationService` — CRUD + `matchKeyword(text)`.
  - `InstagramWebhookService` — parse do payload Meta, dispatch para automations, log em `instagram_logs`.
- `admin.functions.ts` — server fns com `requireSupabaseAuth` + verificação de role admin: `getSettings`, `saveSettings`, `testConnection`, `publishStory`, `listComments`, `replyComment`, `listConversations`, `listAutomations`, `saveAutomation`, `deleteAutomation`.
- Rota pública `src/routes/api/public/meta/webhook.ts` (`GET` verify + `POST` receive) — insere log, aplica automations DM (responde "link" → mensagem com `{{affiliate_link}}`).

Storage: bucket `instagram-uploads` (public) para imagens de Story.

## Frontend

Menu lateral novo em `app-sidebar.tsx`: seção **Instagram** com subitens.

Novas rotas:

- `src/routes/_authenticated/instagram/configuracoes.tsx` — form (Business ID, Page ID, Access Token), botões **Testar conexão** e **Salvar**. Toast + status 🟢/🔴.
- `src/routes/_authenticated/instagram/publicacoes.tsx` — lista de posts recentes (Graph `/{ig}/media`).
- `src/routes/_authenticated/instagram/stories.tsx` — upload de imagem (Supabase Storage) + legenda + **Publicar Story**.
- `src/routes/_authenticated/instagram/comentarios.tsx` — lista comentários, botão **Responder** com dialog.
- `src/routes/_authenticated/instagram/mensagens.tsx` — lista conversas (nome, última msg, horário, status).
- `src/routes/_authenticated/instagram/automacoes.tsx` — CRUD palavra-chave/mensagem, toggle enabled.

Componentes reutilizáveis em `src/components/instagram-admin/` (StatusBadge, ConnectionCard, CommentCard, AutomationForm, StoryComposer). Loading states via `useQuery`/`useMutation`, toasts via `sonner`.

`AuthGate` continua protegendo. Verificação de role admin no server; UI mostra aviso se usuário não for admin.

## Env / configuração
Reutiliza `META_APP_ID`/`META_APP_SECRET` (opcional, só para verificação de assinatura do webhook) e `META_WEBHOOK_VERIFY_TOKEN`. Nada de OAuth.

## Escopo excluído
- Não altera o fluxo Instagram existente por canal (`instagram_connections`) nem o InstaBotHelp — o novo módulo é paralelo e independente.
- Nenhum "Login com Facebook" ou tela OAuth.

Confirma que devo prosseguir com essa estrutura? Um ponto para decidir: **você quer que o novo módulo substitua o painel Instagram por canal (remover a integração antiga) ou conviva em paralelo?** Por padrão vou mantê-los em paralelo.
