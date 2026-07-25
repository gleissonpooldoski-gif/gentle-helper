
## InstaBotHelp — Automação de comentários + Direct

Novo módulo **isolado** dentro de `Canais e Grupos → Editar → InstaBotHelp`. Nada fora dessa aba é alterado. A aba já existe visualmente (mockup) — vou substituir o conteúdo mockado por um módulo real, mantendo o mesmo padrão visual do SaaS (cards, botões, tokens).

### 1. Banco (nova migração, isolada por canal + usuário)

Novas tabelas em `public`, todas com RLS por `user_id` e escopo por `channel_id`:

- `instabot_automations` — 1 registro por publicação IG configurada
  - `channel_id`, `ig_media_id`, `ig_media_url`, `thumbnail_url`, `caption`, `posted_at`
  - `enabled` (bool)
  - `keywords` (text[]) — múltiplas palavras-gatilho
  - `comment_reply_mode` ('auto' | 'list')
  - `comment_replies` (text[]) — frases rotativas quando não é auto
  - `dm_message` (text)
  - `button_label` (text)
  - `button_url` (text)
- `instabot_events` — histórico
  - `automation_id`, `channel_id`
  - `ig_user_id`, `ig_username`, `comment_text`, `comment_id`
  - `dm_sent` (bool), `dm_message`, `status`, `error`
  - `created_at`
- `instabot_clicks` — cliques no botão (para taxa/estatística; incrementado por um redirect route)
  - `automation_id`, `event_id?`, `created_at`

GRANTs padrão + RLS `auth.uid() = user_id`.

### 2. Servidor — `src/lib/instabot.functions.ts`

Funções (todas `.middleware([requireSupabaseAuth])`, escopo `channelId`):

- `listInstagramMedia({ channelId })` — usa `instagram_connections` existente + Graph API `/{ig-user-id}/media` (thumbnail, caption, timestamp, permalink). Reaproveita `instagram-graph.server.ts` e `instagram-crypto.server.ts`.
- `listAutomations({ channelId })`
- `upsertAutomation({ channelId, ...fields })`
- `deleteAutomation({ id, channelId })`
- `toggleAutomation({ id, enabled })`
- `listAutomationHistory({ automationId, limit })`
- `getAutomationStats({ automationId })` — detectados, DMs enviadas, cliques, taxa
- `generateWithAI({ channelId, mediaCaption })` — chama Lovable AI Gateway (`google/gemini-3.6-flash`) e devolve `{ keywords, comment_replies, dm_message }` (Output schema estruturado)

### 3. Webhook — estender captura existente

`src/lib/instagram-webhook.server.ts` já processa comentários. Adicionar antes do fluxo genérico:

1. Buscar `instabot_automations` por `ig_media_id = mediaId` e `enabled = true`.
2. Se match e alguma keyword bater no texto do comentário:
   - Escolher resposta ao comentário (aleatória da lista, ou IA se `mode='auto'`).
   - Chamar `replyToComment`.
   - Enviar DM com `sendDirectMessage` usando `dm_message` + botão `button_label` → link rastreável (`/api/public/instabot/r/{eventId}`).
   - Registrar em `instabot_events`.
3. Só cair no fluxo de keywords antigo se nenhuma automação InstaBotHelp cobrir.

### 4. Redirect de clique

`src/routes/api/public/instabot/r.$eventId.ts` — GET: incrementa `instabot_clicks` e redireciona 302 para `button_url` do evento.

### 5. UI — substituir `InstaBotHelpPanel` mockado (linhas 2184–2350)

Mesmos tokens/componentes já usados no arquivo (Button, Input, Card visual em rounded-2xl, gradiente header IG). Estrutura:

```text
[Header gradient IG — mantém visual atual]
[Abas internas: Automações | Histórico | Estatísticas]

Aba Automações:
 - Grid de publicações do IG (thumb, data, caption)
 - "Nova automação" no card ou "Editar" se já existir
 - Modal/Sheet de edição:
   * ☑ Ativar
   * Palavras-chave (textarea, uma por linha)
   * Resposta ao comentário (textarea "auto" ou várias frases)
   * Mensagem do Direct (textarea grande)
   * Texto do botão (input)
   * Link (input url)
   * [✨ Gerar automaticamente]  [Salvar]  [Excluir]

Aba Histórico:
 - Tabela: usuário | comentário | data | DM enviada | status

Aba Estatísticas:
 - 4 cards: detectados, DMs enviadas, cliques, taxa de resposta
```

Se o canal não tem `instagram_connections` ativa, mostrar CTA "Conecte o Instagram na aba Instagram".

### 6. Fora de escopo (explicitamente)

Não toco em: agendamentos, publicações existentes, aba IA global, aba Instagram existente, Facebook, YouTube, TikTok, WhatsApp, Automação, Layout, Site, Relatórios.

### Detalhes técnicos

- IA: `openai/gpt-5.5` via Lovable Gateway? O projeto já usa Gemini em outros pontos — vou usar `google/gemini-3.6-flash` (rápido/barato) com `response_format: json_object` e schema Zod.
- Isolamento: toda query filtra por `user_id` (RLS) **e** `channel_id` no WHERE.
- Layout: reutilizar exatamente `Button`, `Input`, `cn`, tokens `border-border/70 bg-card rounded-2xl` já presentes.
- Migração inclui GRANTs para `authenticated` e `service_role`.
