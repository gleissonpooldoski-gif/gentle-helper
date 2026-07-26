## Problema

O **Agendamento Recorrente do Story** e o botão **Publicar agora** publicam apenas a arte crua (ou só o template, ou só a foto do produto). Não fazem a composição que aparece no preview do canvas: template de fundo + foto do produto no card + título + "POR R$ …".

Motivo: a composição hoje mora no `<canvas>` do navegador (`src/routes/instagram.stories.tsx`), e o cron (`src/routes/api/public/hooks/instagram-tick.ts`) e o `runAdminStoryScheduleNow` (`src/modules/instagram-admin/admin.functions.ts`) rodam no Worker, onde não existe DOM/canvas.

## Solução

Compor a arte 1080×1920 no servidor, salvar como PNG em `story-images`, gerar signed URL e publicar via Graph — reutilizando o pipeline já existente. Um único helper server-side é chamado tanto pelo cron quanto pelo "Publicar agora".

### Render server-side sem canvas

Usar SVG + rasterização WASM (funciona no runtime Worker):

- Nova dependência: `@resvg/resvg-wasm`
- Novo helper: `src/modules/instagram-admin/compose.server.ts`
  - `composeStoryPng({ templateUrl, product, titleColor, priceColor }) → Uint8Array`
  - Baixa o template e a foto do produto (via `fetch` com user-agent mobile, mesma tática do image-resolver já usado no projeto)
  - Converte ambos para `data:` base64
  - Monta uma string SVG 1080×1920 com:
    - `<image>` do template cobrindo tudo (fallback: retângulo amarelo)
    - `<image>` da foto do produto centralizada no card (mesmas coordenadas do canvas: `PROD {180,470,720,640}`)
    - `<text>` do título quebrado em até 2 linhas na área `TITLE {90,1130,900,170}` com `titleColor`
    - `<text>` do preço na barra `PRICE_BAR {90,1310,900,170}`; quando há desconto, mostra "DE R$ X" com strikethrough por cima e "POR R$ Y" grande abaixo (branco), igual ao canvas
  - Rasteriza o SVG para PNG com `@resvg/resvg-wasm`
- Fallback: se a foto do produto falhar por CORS/404, compõe sem ela (título + preço ainda aparecem).

### Upload + publicação

Extrair a parte de upload/publish que já existe em `publishStoryCampaign` para um helper compartilhado `uploadAndPublishStory({ pngBytes, settings }) → mediaId` em `compose.server.ts`:

- Sobe em `story-images` como `story-<timestamp>.png`
- Gera signed URL (1h)
- Chama `publishStory` do Graph

### Integração

- `src/modules/instagram-admin/admin.functions.ts` → `runAdminStoryScheduleNow`: em vez de passar `imageUrl` cru pro `publishStory`, chama `composeStoryPng` e `uploadAndPublishStory`.
- `src/routes/api/public/hooks/instagram-tick.ts` (bloco "2) Admin schedule"): mesma troca. Mantém a lógica de janela de horário, anti-repetição e registro da campanha (`instagram_campaigns`) com `keyword: "eu quero"` e `affiliate_link`.
- `publishStoryCampaign` (fluxo manual do painel) continua funcionando exatamente como está — o preview no canvas já entrega o PNG pronto.

### Fora do escopo

- Layout novo, fontes customizadas, ou mudar as coordenadas do template.
- Novo componente de UI — o botão "Publicar agora" e o painel de agendamento continuam iguais.
- Composição de Feed post (só Story).
