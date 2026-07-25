# Editor Visual de Templates (estilo Canva)

Substituir o editor atual de Stories/Layouts por um editor drag-and-drop unificado, focado em afiliados. Sem JSON, sem coordenadas expostas — tudo visual.

## 1. Modelo de dados

Nova tabela `visual_templates` (substitui o uso atual de `instagram_story_templates` para este fluxo):

- `name`, `format` (`ig_story` 1080x1920, `ig_post` 1080x1080, `whatsapp` 1080x1350)
- `channel_id` (nullable — templates admin)
- `preset` (ex.: `oferta_relampago`, `black_friday`, `cupom`, `shopee`, `achadinhos`, `viral`, `super_oferta`, `blank`)
- `is_default` (boolean por canal+formato)
- `elements` (jsonb) — array de elementos com `{ id, type, x, y, w, h, rotation, z, props }`
  - Tipos: `background`, `shape`, `image`, `product_image`, `logo`, `text`, `price`, `discount`, `rating`, `sold`, `store`, `buy_button`, `free_text`
  - `props` guarda fonte, cor, peso, alinhamento, radius, src, binding a variável (`{{price}}`, `{{title}}`, etc.)
- `preview_url` (PNG gerado do canvas, salvo no bucket `story-images`)

Auto-save: cada alteração chama `saveTemplate` (debounce 800ms).

## 2. Editor visual (`/templates/editor/$id`)

Layout de 3 colunas:

```text
┌──────────┬────────────────────────┬───────────┐
│ Elements │        CANVAS          │ Propried. │
│  Sidebar │   (Fabric.js real)     │ do item   │
└──────────┴────────────────────────┴───────────┘
```

**Sidebar de elementos** (botões grandes com ícone+nome):
Imagem do Produto, Preço, Desconto, Título, Avaliação, Vendidos, Loja, Botão Comprar, Logo, Texto Livre, Fundo, Formas.

Clicar adiciona o elemento no centro do canvas com placeholder já vinculado à variável correta.

**Canvas** (Fabric.js 6):
- Drag, resize, rotate nativos
- Snapping em bordas + centro
- Zoom (25%–200%) + fit-to-screen
- Ctrl+D duplica, Delete remove, Ctrl+Z/Y desfaz

**Painel de propriedades** (contextual):
- Texto: fonte (10 opções), tamanho, peso, cor, alinhamento, espaçamento
- Imagem: trocar arquivo, arredondar bordas, ajuste (cover/contain)
- Preço: escolher entre "Preço antigo (DE)", "Preço atual (POR)", "Ambos DE/POR"; escolher moeda, prefixo, estilo de riscado
- Forma: cor, radius, borda
- Fundo: cor sólida, gradiente ou upload

## 3. Barra superior

- Nome do template (editável inline)
- Formato atual (troca com aviso de reajuste)
- Botões: **Duplicar**, **Baixar PNG**, **Definir como padrão**, **Usar em campanha**
- Indicador "Salvo automaticamente"

## 4. Templates prontos (`preset`)

Ao criar novo template o usuário escolhe:
1. Formato (Story / Post / WhatsApp)
2. Modelo inicial: **Em branco**, **Oferta Relâmpago**, **Shopee**, **Black Friday**, **Cupom**, **Super Oferta**, **Achadinhos**, **Produto Viral**

Cada preset é apenas um `elements` inicial pré-montado — usuário edita livremente depois.

## 5. Binding automático com produto

Todo elemento "inteligente" guarda `props.bind = "{{price}}"` etc. Ao renderizar (preview ou envio real):
- Buscar produto selecionado
- Substituir cada bind pela informação real (formatBRL, humanização de vendidos, cálculo de desconto)
- `product_image` baixa a imagem e desenha respeitando radius e crop

Nada aparece como `{{...}}` para o usuário final — no editor mostramos placeholder amigável ("R$ 99,90", "Título do produto") e um pequeno chip 🔗 indicando que está ligado ao produto.

## 6. Renderização e uso

Função server `renderTemplate({ templateId, productId })`:
- Lê `elements`, resolve binds com o produto
- Compõe PNG 1080×(formato) em node-canvas
- Retorna base64 + upload no bucket

Usada por:
- Preview no editor (client-side via Fabric.toDataURL)
- Envio automático (WhatsApp / Instagram Story)
- Download manual (botão Baixar PNG)
- Campanhas (seleciona template + lista de produtos → gera N artes)

## 7. Migração do que já existe

- Manter tabela antiga `instagram_story_templates` só leitura (compat), mas todo o fluxo de Stories passa a ler de `visual_templates` filtrando `format='ig_story'`
- Layout Post (texto) continua separado — este editor é para arte visual, não para texto de mensagem
- A tela atual `/instagram/stories` passa a listar templates visuais e abre o novo editor

## 8. Detalhes técnicos (para referência)

- Fabric.js 6 (`fabric` no npm) — não expõe coordenadas ao usuário, só ao dev
- Auto-save com `useMutation` + debounce
- Uploads de imagem/logo/fundo via bucket `story-images` (já existe)
- Fontes web carregadas via `<link>` em `__root.tsx`: Inter, Poppins, Bebas Neue, Montserrat, Oswald, Playfair, Anton, Archivo Black
- Desfazer/refazer via histórico local (últimos 50 estados)

## 9. Entregáveis desta iteração

1. Migração: tabela `visual_templates` + policies
2. Server functions: `listTemplates`, `getTemplate`, `saveTemplate`, `duplicateTemplate`, `deleteTemplate`, `setDefaultTemplate`, `renderTemplate`
3. Rota `/templates` — lista com filtro por formato/canal + botão "Novo template"
4. Rota `/templates/editor/$id` — editor Fabric.js completo
5. Modal "Novo template" com escolha de formato + preset
6. 8 presets pré-montados (blank + 7 modelos)
7. Integração: o modal de Story do Instagram e o envio WhatsApp passam a poder escolher um `visual_template` como arte

Depois da aprovação eu já executo a migração e implemento em uma sequência de PRs internos.
