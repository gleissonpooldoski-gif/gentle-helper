import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { parseShopeeCsv, type ShopeeCsvRow } from "@/modules/products/shopee-import/csv.processor";
import { importShopeeBatch } from "@/modules/products/shopee-import/shopee-import.controller.functions";
import { deleteProductsByItemIds, deleteAllProducts } from "@/modules/products/shopee-import/product-delete.functions";
import { listPendingShopeeImages, enrichShopeeImageOne } from "@/modules/products/shopee-import/image-enrich.functions";
import { addMLProductByLink, searchMLProducts, addMLProductsByIds } from "@/modules/products/mercadolivre/controller.functions";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check,
  ChevronDown,
  Chrome,
  Copy,
  Download,
  Edit3,
  HelpCircle,
  Info,
  Instagram,
  MessageCircle,
  MoreHorizontal,
  Palette,
  PlayCircle,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Sparkles,
  Tag,
  Ticket,
  Trash2,
  Upload,
  Users,
  X,
  FileSpreadsheet,
  ShoppingBag,
} from "lucide-react";



import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { cn } from "@/lib/utils";



export const Route = createFileRoute("/canais/$id/editar")({
  head: () => ({
    meta: [
      { title: "Editar Canal · DivulgaLinks" },
      {
        name: "description",
        content:
          "Configure postagens, automação, templates e integrações do seu canal.",
      },
      { property: "og:title", content: "Editar Canal · DivulgaLinks" },
      {
        property: "og:description",
        content: "Painel completo de edição de canal/grupo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EditChannelPage,
});

const TABS = [
  { id: "geral", label: "Geral", tone: "active" as const },
  { id: "layout", label: "Layout Post" },
  { id: "site", label: "Site" },
  { id: "instagram", label: "Instagram", tone: "danger" as const },
  { id: "instasched", label: "InstaSched" },
  { id: "instabot", label: "InstaBotHelp" },
  { id: "wa-grupos", label: "WhatsApp - GRUPOS/CANAIS", tone: "success" as const },
  { id: "wa-monitor", label: "WA - Monitorar Grupos" },
  { id: "amazon", label: "Amazon" },
  { id: "ml", label: "Mercado Livre", count: 272 },
  { id: "shopee", label: "Shopee", count: 799 },
];

const STORES = [
  "Amazon",
  "Shopee",
  "Mercado Livre",
];

function EditChannelPage() {
  const { id } = Route.useParams();
  const [tab, setTab] = useState("geral");
  const [keepLink, setKeepLink] = useState(true);
  const [neverExpires, setNeverExpires] = useState(true);
  const [autoPost, setAutoPost] = useState(true);
  const [loop, setLoop] = useState(true);
  const [feedActive, setFeedActive] = useState(false);
  const [activeStores, setActiveStores] = useState<string[]>([
    "Shopee",
    "Amazon",
    "Mercado Livre",
  ]);

  const toggleStore = (s: string) =>
    setActiveStores((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );

  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased lg:flex">
      <AppSidebar activeId="canais" />

      <div className="flex-1 lg:min-w-0">
        <main className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-8 sm:px-6 lg:px-10">
          {/* Header card */}
          <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.08)] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <Link
                to="/"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border/70 bg-background text-muted-foreground hover:text-foreground"
                aria-label="Voltar"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[oklch(0.68_0.15_235)] to-[oklch(0.55_0.18_245)] text-white shadow-sm">
                <Send className="h-5 w-5" strokeWidth={2.4} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Editar canal · ID {id}
                </p>
                <h1 className="truncate font-display text-2xl font-bold tracking-tight text-foreground">
                  SEGREDO DAS PROMOÇÕES
                </h1>
              </div>
            </div>

            <Button
              size="lg"
              className="rounded-full bg-primary px-6 shadow-[0_10px_30px_-12px_oklch(0.62_0.19_256/0.6)] hover:bg-primary/90"
            >
              <Save className="mr-1.5 h-4 w-4" />
              Atualizar
            </Button>
          </div>

          {/* Tabs */}
          <div className="mt-5 overflow-x-auto rounded-2xl border border-border/70 bg-card p-2">
            <div className="flex min-w-max items-center gap-1">
              {TABS.map((t) => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-medium transition-all",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-foreground/70 hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {t.tone === "danger" && (
                      <span className="text-[color:var(--color-danger)]">✕</span>
                    )}
                    {t.tone === "success" && (
                      <Check className="h-3 w-3 text-[color:var(--color-success)]" strokeWidth={3} />
                    )}
                    <span>{t.label}</span>
                    {typeof t.count === "number" && (
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                          active ? "bg-white/20" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {t.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {tab === "layout" ? (
            <LayoutPostPanel />
          ) : tab === "instagram" ? (
            <InstagramPanel />
          ) : tab === "instasched" ? (
            <InstaSchedPanel />
          ) : tab === "instabot" ? (
            <InstaBotHelpPanel />
          ) : tab === "wa-grupos" ? (
            <WhatsAppGroupsPanel />
          ) : tab === "wa-monitor" ? (
            <WhatsAppMonitorPanel />
          ) : tab === "ml" ? (
            <MercadoLivrePanel />
          ) : tab === "shopee" ? (
            <ShopeePanel />
          ) : (





          /* Content grid */
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">

            {/* LEFT column */}
            <div className="space-y-6">
              {/* Product link + metadata */}
              <SectionCard title="Link do produto" icon={<Info className="h-4 w-4" />}>
                <Field label="Link do Produto">
                  <Input placeholder="https://..." className="h-10" />
                </Field>

                <Alert tone="warning">
                  <strong>ATENÇÃO!</strong> produtos adicionados via link{" "}
                  <strong>NÃO</strong> são atualizados automaticamente.
                </Alert>

                <Checkbox
                  checked={keepLink}
                  onChange={setKeepLink}
                  label="Manter esse link no post."
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Cabeçalho Dinâmico">
                    <SelectShell>Padrão do canal</SelectShell>
                  </Field>
                  <Field label="Ou digite um novo cabeçalho">
                    <Input placeholder="Novo cabeçalho..." className="h-10" />
                  </Field>
                </div>

                <Field label="Link Shopee Video">
                  <Input placeholder="Ex: https://br.shp.ee/ejolle5..." className="h-10" />
                </Field>
                <Alert tone="info">
                  Substitui o link original em dispositivos móveis para abrir
                  direto no app da Shopee com o vídeo do produto.
                </Alert>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Preço original">
                    <Input placeholder="R$ 0,00" className="h-10" />
                  </Field>
                  <Field label="Preço atual">
                    <Input placeholder="R$ 0,00" className="h-10" />
                  </Field>
                  <Field label="Sufixo do preço">
                    <Input placeholder="ex: no Pix" className="h-10" />
                  </Field>
                  <Field label="Preço parcelado">
                    <Input placeholder="10x de R$ 0,99" className="h-10" />
                  </Field>
                </div>

                <Field label="Descrição" hint="Escopo apenas deste post.">
                  <textarea
                    rows={3}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    placeholder="Descreva a oferta..."
                  />
                </Field>

                <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Agendamento
                  </p>
                  <Checkbox
                    checked={neverExpires}
                    onChange={setNeverExpires}
                    label="NÃO EXPIRA"
                  />
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="relative">
                      <Input type="date" className="h-10 pr-9" disabled={neverExpires} />
                      <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                    <Input type="time" className="h-10" disabled={neverExpires} />
                  </div>
                </div>
              </SectionCard>

              {/* Cupons */}
              <SectionCard title="Cupons" icon={<Ticket className="h-4 w-4" />}>
                <Field label="Tipo de Cupom">
                  <div className="grid grid-cols-3 gap-2">
                    {["R$ Fixo", "% Desconto", "Frete Grátis"].map((t, i) => (
                      <button
                        key={t}
                        type="button"
                        className={cn(
                          "rounded-lg border px-3 py-2 text-sm font-medium transition-all",
                          i === 1
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-foreground/75 hover:border-primary/40",
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label="Valor do desconto">
                    <Input placeholder="0" className="h-10" />
                  </Field>
                  <Field label="Valor mínimo">
                    <Input placeholder="R$ 0,00" className="h-10" />
                  </Field>
                  <Field label="Código do cupom">
                    <Input placeholder="PROMO10" className="h-10 font-mono uppercase" />
                  </Field>
                </div>
              </SectionCard>

              {/* Templates */}
              <SectionCard title="Templates visuais" icon={<Palette className="h-4 w-4" />}>
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <TemplateBlock
                    ratio="Stories (16:9)"
                    onFeed={false}
                  />
                  <TemplateBlock
                    ratio="Feed (1:1)"
                    onFeed
                    feedActive={feedActive}
                    setFeedActive={setFeedActive}
                  />
                </div>
              </SectionCard>
            </div>

            {/* RIGHT column */}
            <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
              {/* Status card */}
              <div className="rounded-2xl border border-[color:var(--color-success)]/25 bg-[color:var(--color-success)]/6 p-5">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[color:var(--color-success)]/15 text-[color:var(--color-success)]">
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </span>
                  <div>
                    <p className="font-display text-sm font-bold text-foreground">
                      Tudo certo!
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Fluxo saudável de publicações
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-baseline justify-between">
                    <span className="font-display text-2xl font-bold text-foreground">
                      1071
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ideal ~300
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">produtos ativos</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/60">
                    <div className="h-full w-full rounded-full bg-gradient-to-r from-[oklch(0.75_0.16_150)] to-[oklch(0.68_0.17_160)]" />
                  </div>
                </div>

                <p className="mt-4 text-[11.5px] leading-relaxed text-foreground/75">
                  Intervalo de <strong>15 min</strong> → <strong>4 posts/hora</strong>.
                  Envio em ordem aleatória com proteção anti-repetição de{" "}
                  <strong>24h</strong>.
                </p>
              </div>

              {/* Frequência */}
              <div className="rounded-2xl border border-border/70 bg-card p-5">
                <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Frequência e loop
                </p>

                <div className="space-y-2">
                  <Checkbox
                    checked={autoPost}
                    onChange={setAutoPost}
                    label="Post automático"
                  />
                  <Checkbox
                    checked={loop}
                    onChange={setLoop}
                    label="Post em Loop"
                    hint="Repete os produtos ao final da lista"
                  />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Field label="Intervalo (min)">
                    <SelectShell>15</SelectShell>
                  </Field>
                  <Field label="Idioma">
                    <SelectShell>Português (PT)</SelectShell>
                  </Field>
                  <Field label="Hora início">
                    <SelectShell>07:00</SelectShell>
                  </Field>
                  <Field label="Hora fim">
                    <SelectShell>22:00</SelectShell>
                  </Field>
                  <Field label="Moeda">
                    <SelectShell>Real (BRL)</SelectShell>
                  </Field>
                  <Field label="País">
                    <SelectShell>Brasil</SelectShell>
                  </Field>
                </div>

                <p className="mt-5 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Lojas ativas
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {STORES.map((s) => (
                    <Checkbox
                      key={s}
                      checked={activeStores.includes(s)}
                      onChange={() => toggleStore(s)}
                      label={s}
                      small
                    />
                  ))}
                </div>

                <Button className="mt-5 h-10 w-full rounded-lg bg-primary hover:bg-primary/90">
                  <Save className="mr-1.5 h-4 w-4" />
                  Salvar
                </Button>
              </div>
            </aside>
          </div>
          )}
        </main>

      </div>
    </div>
  );
}

/* -------- Reusable bits -------- */

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.08)]">
      <header className="mb-5 flex items-center gap-2 border-b border-border/70 pb-3">
        {icon && (
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </span>
        )}
        <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
          {title}
        </h2>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-baseline justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        {hint && <span className="text-[10px] font-normal normal-case text-muted-foreground/80">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function SelectShell({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="flex h-10 w-full items-center justify-between rounded-lg border border-border bg-background px-3 text-sm text-foreground hover:border-primary/40"
    >
      <span>{children}</span>
      <ChevronDown className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

function Alert({
  tone,
  children,
}: {
  tone: "warning" | "info";
  children: React.ReactNode;
}) {
  const styles =
    tone === "warning"
      ? "border-[oklch(0.85_0.15_85)]/40 bg-[oklch(0.98_0.05_90)] text-[oklch(0.45_0.12_75)]"
      : "border-primary/25 bg-primary/6 text-primary";
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] leading-relaxed",
        styles,
      )}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
  hint,
  small,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  small?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <span
        onClick={() => onChange(!checked)}
        className={cn(
          "mt-0.5 grid shrink-0 place-items-center rounded border transition-all",
          small ? "h-3.5 w-3.5" : "h-4 w-4",
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background",
        )}
      >
        {checked && <Check className={cn(small ? "h-2.5 w-2.5" : "h-3 w-3")} strokeWidth={4} />}
      </span>
      <div className="min-w-0">
        <span
          className={cn(
            "font-medium text-foreground",
            small ? "text-[12px]" : "text-sm",
          )}
        >
          {label}
        </span>
        {hint && (
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        )}
      </div>
    </label>
  );
}

function TemplateBlock({
  ratio,
  onFeed,
  feedActive,
  setFeedActive,
}: {
  ratio: string;
  onFeed: boolean;
  feedActive?: boolean;
  setFeedActive?: (v: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
      <p className="mb-3 font-display text-sm font-bold text-foreground">
        Template {ratio}
      </p>
      <a
        href="#"
        className="mb-3 inline-block text-[12px] font-semibold text-primary underline-offset-2 hover:underline"
      >
        CLIQUE AQUI para editar esse template no CANVA
      </a>

      {onFeed && setFeedActive && (
        <div className="mb-3">
          <Checkbox
            checked={!!feedActive}
            onChange={setFeedActive}
            label="Ativar Template no Feed do Telegram"
            small
          />
        </div>
      )}

      <label className="mb-3 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-2.5 text-sm text-muted-foreground hover:border-primary/50">
        <Upload className="h-4 w-4" />
        <span>Escolha um arquivo</span>
        <input type="file" className="hidden" />
      </label>

      {!onFeed && (
        <div className="mb-3 grid grid-cols-2 gap-3">
          <Field label="Cor do Título">
            <input
              type="color"
              defaultValue="#ffffff"
              className="h-10 w-full cursor-pointer rounded-lg border border-border bg-background"
            />
          </Field>
          <Field label="Cor do Preço">
            <input
              type="color"
              defaultValue="#f59e0b"
              className="h-10 w-full cursor-pointer rounded-lg border border-border bg-background"
            />
          </Field>
        </div>
      )}

      <Button className="h-9 w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
        <Save className="mr-1.5 h-3.5 w-3.5" />
        Salvar
      </Button>
    </div>
  );
}

/* -------- Layout Post tab -------- */

function LayoutPostPanel() {
  const [waPreview, setWaPreview] = useState(true);
  const [upper, setUpper] = useState(true);
  const [hideSales, setHideSales] = useState(false);
  const [hideOriginal, setHideOriginal] = useState(false);

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* LEFT */}
      <div className="space-y-5">
        <SectionCard title="Estrutura do post" icon={<Palette className="h-4 w-4" />}>
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
            <Checkbox
              checked={waPreview}
              onChange={setWaPreview}
              label="WHATSAPP: ENVIAR IMAGEM COMO PREVIEW (link card)"
            />
          </div>

          <LayoutField
            label="Cabeçalho Geral"
            hint="Esse texto será exibido acima do título do produto"
            defaultValue="🚨 OFERTA RELÂMPAGO!!"
          />

          <LayoutField
            label="Texto do Título"
            hint="Use as tags para formatar. Ex: 🔥🔥 <b>{title}</b> 🔥🔥"
            defaultValue="🔥🔥 <b>{title}</b> 🔥🔥"
          />

          <div className="grid grid-cols-1 gap-2 rounded-xl border border-border/70 bg-muted/30 p-3 sm:grid-cols-2">
            <Checkbox checked={upper} onChange={setUpper} label="TÍTULO EM MAIÚSCULO" small />
            <Checkbox
              checked={hideSales}
              onChange={setHideSales}
              label="OCULTAR TEXTO DE VENDAS"
              small
            />
          </div>

          <LayoutField
            label="Texto de Vendas"
            defaultValue="🛒 <i>{vendas} pedidos</i> 🛒"
            disabled={hideSales}
          />

          <LayoutField
            label="Texto da Descrição"
            defaultValue="<pre>{description}</pre>"
            rows={2}
          />

          <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
            <Checkbox
              checked={hideOriginal}
              onChange={setHideOriginal}
              label="OCULTAR VALOR ORIGINAL"
              small
            />
          </div>
          <LayoutField
            label="Texto do Preço Original"
            defaultValue="❌❌ <s>{price_original}</s> ❌❌"
            disabled={hideOriginal}
          />

          <LayoutField
            label="Texto do Parcelamento"
            defaultValue="💳💳 {parcelamento} 💳💳"
          />
          <LayoutField
            label="Texto do Preço Atual"
            defaultValue="💵💵 <b>{price}</b> 💵💵"
          />
          <LayoutField
            label="Texto do Link de Afiliado"
            defaultValue="🔗🔗 {link} 🔗🔗"
          />

          <LayoutField
            label="Rodapé Geral"
            hint="Exibido ao final de todos os posts"
            defaultValue="✨ Aproveite! Ofertas por tempo limitado."
            rows={2}
          />

          <div className="flex justify-end pt-2">
            <Button className="h-10 rounded-lg bg-primary px-6 hover:bg-primary/90">
              <Save className="mr-1.5 h-4 w-4" />
              Salvar layout
            </Button>
          </div>
        </SectionCard>
      </div>

      {/* RIGHT — tips */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.08)]">
          <div className="mb-4 flex items-center gap-2 border-b border-border/70 pb-3">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
              <Info className="h-4 w-4" />
            </span>
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
              Dicas de formatação
            </h2>
          </div>
          <p className="mb-4 text-[12px] leading-relaxed text-muted-foreground">
            Tags HTML aceitas nos textos do post. Copie e cole conforme necessário.
          </p>

          <ul className="space-y-2.5">
            {[
              { render: <b>negrito</b>, code: "<b>negrito</b>" },
              { render: <i>itálico</i>, code: "<i>itálico</i>" },
              { render: <u>sublinhado</u>, code: "<u>sublinhado</u>" },
              { render: <s>riscado</s>, code: "<s>riscado</s>" },
              {
                render: (
                  <span className="rounded bg-foreground/15 px-1 text-transparent hover:text-foreground">
                    spoiler
                  </span>
                ),
                code: '<span class="tg-spoiler">spoiler</span>',
              },
              {
                render: (
                  <code className="rounded bg-muted px-1 font-mono text-[12px]">
                    código inline
                  </code>
                ),
                code: "<code>código de largura fixa inline</code>",
              },
              {
                render: (
                  <pre className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                    bloco pré-formatado
                  </pre>
                ),
                code: "<pre>bloco de código de largura fixa pré-formatado</pre>",
              },
            ].map((t, i) => (
              <li
                key={i}
                className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
              >
                <div className="text-sm text-foreground">{t.render}</div>
                <code className="mt-1 block break-all font-mono text-[10.5px] text-muted-foreground">
                  {t.code}
                </code>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function LayoutField({
  label,
  hint,
  defaultValue,
  rows = 1,
  disabled,
}: {
  label: string;
  hint?: string;
  defaultValue?: string;
  rows?: number;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {rows > 1 ? (
        <textarea
          defaultValue={defaultValue}
          rows={rows}
          disabled={disabled}
          className={cn(
            "w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-[13px] outline-none focus:border-primary",
            disabled && "opacity-50",
          )}
        />
      ) : (
        <input
          defaultValue={defaultValue}
          disabled={disabled}
          className={cn(
            "h-10 w-full rounded-lg border border-border bg-background px-3 font-mono text-[13px] outline-none focus:border-primary",
            disabled && "opacity-50",
          )}
        />
      )}
      {hint && (
        <p className="mt-1 text-[11px] italic text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}


/* -------- Instagram tab -------- */

const WEEKDAYS = [
  { id: "dom", label: "Dom" },
  { id: "seg", label: "Seg" },
  { id: "ter", label: "Ter" },
  { id: "qua", label: "Qua" },
  { id: "qui", label: "Qui" },
  { id: "sex", label: "Sex" },
  { id: "sab", label: "Sáb" },
];

const DEFAULT_HOURS = [8, 9, 12, 13, 17, 18, 21, 22];

function InstagramPanel() {
  const [autoPost, setAutoPost] = useState(true);
  const [disableReply, setDisableReply] = useState(false);
  const [schedActive, setSchedActive] = useState(true);
  const [days, setDays] = useState<string[]>(["seg", "ter", "qua", "qui", "sex"]);
  const [hours, setHours] = useState<number[]>(DEFAULT_HOURS);
  const [replyText, setReplyText] = useState(
    "Ficou feliz que tenha gostado 😅 Já deixei o link abaixo. Aproveita porque esse valor costuma acabar rápido ⏰👇",
  );

  const toggleDay = (d: string) =>
    setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));
  const toggleHour = (h: number) =>
    setHours((p) => (p.includes(h) ? p.filter((x) => x !== h) : [...p, h]));

  return (
    <div className="mt-6 space-y-6">
      {/* Instagram gradient banner */}
      <div className="relative overflow-hidden rounded-2xl border border-border/70 p-6 text-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_40px_-24px_rgba(220,50,120,0.55)]">
        <div className="absolute inset-0 bg-[linear-gradient(115deg,#feda75_0%,#fa7e1e_25%,#d62976_55%,#962fbf_80%,#4f5bd5_100%)]" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/20 backdrop-blur">
              <Instagram className="h-6 w-6" strokeWidth={2.2} />
            </span>
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">
                📸 Instagram
              </h2>
              <p className="text-[13px] text-white/85">
                Configurações da conta{" "}
                <span className="font-semibold">@segredodapromocao</span>
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
            Conectado
          </span>
        </div>
      </div>

      {/* Row 1 — account + growth chart */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Conta vinculada" icon={<Users className="h-4 w-4" />}>
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-[linear-gradient(135deg,#feda75,#d62976,#4f5bd5)] p-[2px]">
                <div className="grid h-full w-full place-items-center rounded-full bg-card font-display text-lg font-bold text-foreground">
                  SP
                </div>
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-card bg-emerald-500 text-white">
                <Check className="h-2.5 w-2.5" strokeWidth={4} />
              </span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] text-muted-foreground">
                @segredodapromocao
              </p>
              <p className="truncate font-display text-lg font-bold text-foreground">
                Segredo Das Promoções 🛍️
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-border/70 bg-muted/30 p-3 text-center">
            {[
              { n: 34, l: "Mídias" },
              { n: 108, l: "Seguidores" },
              { n: 28, l: "Seguindo" },
            ].map((s) => (
              <div key={s.l}>
                <p className="font-display text-xl font-bold text-foreground">
                  {s.n}
                </p>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {s.l}
                </p>
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            className="mt-4 h-10 w-full rounded-lg border-red-300 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Desconectar Instagram
          </Button>
        </SectionCard>

        <SectionCard title="Crescimento de seguidores" icon={<Sparkles className="h-4 w-4" />}>
          <FollowerChart />
          <div className="mt-3 flex items-center justify-center gap-5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-primary" />
              Crescimento total
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-[oklch(0.7_0.18_25)]" />
              Ganho diário
            </span>
          </div>
        </SectionCard>
      </div>

      {/* Row 2 — template + preview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <SectionCard title="Template IG Story (9:16)" icon={<Palette className="h-4 w-4" />}>
          <a
            href="#"
            className="inline-block text-[13px] font-semibold text-primary underline-offset-2 hover:underline"
          >
            Clique aqui para editar o template no Canva
          </a>

          <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-2.5 text-sm text-muted-foreground hover:border-primary/50">
            <Upload className="h-4 w-4" />
            <span className="flex-1">Escolha um arquivo</span>
            <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              Nenhum selecionado
            </span>
            <input type="file" className="hidden" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Cor do Título">
              <input
                type="color"
                defaultValue="#ffffff"
                className="h-10 w-full cursor-pointer rounded-lg border border-border bg-background"
              />
            </Field>
            <Field label="Cor do Preço">
              <input
                type="color"
                defaultValue="#facc15"
                className="h-10 w-full cursor-pointer rounded-lg border border-border bg-background"
              />
            </Field>
          </div>

          <Button className="h-10 w-full rounded-lg bg-gradient-to-r from-[oklch(0.7_0.19_45)] to-[oklch(0.62_0.22_25)] text-white shadow-[0_10px_24px_-14px_rgba(220,80,20,0.6)] hover:opacity-95">
            <Save className="mr-1.5 h-4 w-4" />
            Salvar
          </Button>
        </SectionCard>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.08)]">
            <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Preview do Story
            </p>
            <StoryPreview />
          </div>
        </aside>
      </div>

      {/* Row 3 — auto reply */}
      <SectionCard
        title="Resposta automática do story"
        icon={<Send className="h-4 w-4" />}
      >
        <div className="space-y-2">
          <div className="flex items-start gap-2 rounded-lg border border-[oklch(0.85_0.15_85)]/40 bg-[oklch(0.98_0.05_90)] px-3 py-2 text-[12px] leading-relaxed text-[oklch(0.42_0.12_75)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Não há compatibilidade com figurinhas (links, enquetes, localização).
            </span>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-[12px] leading-relaxed text-primary">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              📢 O template deve conter a chamada: <b>"Comente QUERO para receber o link!"</b>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ToggleRow
            label="Post automático"
            description="Publicar stories automaticamente"
            checked={autoPost}
            onChange={setAutoPost}
          />
          <ToggleRow
            label="Desativar resposta no comentário"
            description="Não enviar DM para quem comentar"
            checked={disableReply}
            onChange={setDisableReply}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Texto da resposta automática ao story
            </label>
            <span className="text-[11px] text-muted-foreground">
              {replyText.length}/500
            </span>
          </div>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value.slice(0, 500))}
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
          />
        </div>

        <Field label="Texto do botão de link">
          <Input
            defaultValue="VER PARA COMPRAR"
            className="h-10 font-mono uppercase"
          />
        </Field>

        <div className="flex justify-end">
          <Button className="h-10 rounded-lg bg-gradient-to-r from-[oklch(0.7_0.19_45)] to-[oklch(0.62_0.22_25)] px-6 text-white shadow-[0_10px_24px_-14px_rgba(220,80,20,0.6)] hover:opacity-95">
            <Save className="mr-1.5 h-4 w-4" />
            Salvar
          </Button>
        </div>
      </SectionCard>

      {/* Row 4 — schedule + tips */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <SectionCard
          title="Agendamento recorrente do story"
          icon={<Calendar className="h-4 w-4" />}
        >
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Dias da semana
            </p>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => {
                const on = days.includes(d.id);
                return (
                  <button
                    key={d.id}
                    onClick={() => toggleDay(d.id)}
                    className={cn(
                      "h-9 min-w-[54px] rounded-lg border px-3 text-[12px] font-semibold transition-all",
                      on
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-background text-foreground/70 hover:border-primary/40",
                    )}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Horários (hora cheia)
            </p>
            <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12">
              {Array.from({ length: 24 }).map((_, h) => {
                const on = hours.includes(h);
                return (
                  <button
                    key={h}
                    onClick={() => toggleHour(h)}
                    className={cn(
                      "h-9 rounded-md border text-[12px] font-semibold transition-all",
                      on
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-background text-foreground/60 hover:border-primary/40",
                    )}
                  >
                    {h}
                  </button>
                );
              })}
            </div>
          </div>

          <ToggleRow
            label="Ativo?"
            description="Habilitar o agendamento recorrente"
            checked={schedActive}
            onChange={setSchedActive}
          />

          <div className="flex justify-end">
            <Button className="h-10 rounded-lg bg-primary px-6 hover:bg-primary/90">
              <Save className="mr-1.5 h-4 w-4" />
              Salvar Agendamento
            </Button>
          </div>
        </SectionCard>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.08)]">
            <div className="mb-4 flex items-center gap-2 border-b border-border/70 pb-3">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
                <Info className="h-4 w-4" />
              </span>
              <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
                Dicas úteis
              </h2>
            </div>
            <ul className="space-y-2.5 text-[13px] text-foreground/85">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" strokeWidth={3} />
                <span>
                  Limite de até <b>25 posts automáticos</b> por 24 horas.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" strokeWidth={3} />
                <span>
                  Proporção correta de <b>9:16 (1080×1920px)</b>.
                </span>
              </li>
              <li className="flex items-start gap-2 rounded-lg border border-[oklch(0.85_0.15_85)]/40 bg-[oklch(0.98_0.05_90)] px-2 py-2 text-[12px] text-[oklch(0.42_0.12_75)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Se o Instagram desconectar, reconecte usando <b>4G</b> ao invés
                  de Wi-Fi.
                </span>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-foreground">{label}</p>
        {description && (
          <p className="text-[11px] text-muted-foreground">{description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-border",
        )}
        aria-pressed={checked}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
    </label>
  );
}

function FollowerChart() {
  const data = [
    { d: "01/09", total: 82, daily: 2 },
    { d: "05/09", total: 86, daily: 3 },
    { d: "10/09", total: 90, daily: 4 },
    { d: "15/09", total: 94, daily: 2 },
    { d: "20/09", total: 98, daily: 5 },
    { d: "25/09", total: 102, daily: 3 },
    { d: "30/09", total: 105, daily: 4 },
    { d: "05/10", total: 108, daily: 3 },
  ];
  const max = 120;
  return (
    <div className="relative h-[180px] w-full">
      <div className="absolute inset-0 flex flex-col justify-between text-[10px] text-muted-foreground">
        {[120, 90, 60, 30, 0].map((v) => (
          <div key={v} className="flex items-center gap-2">
            <span className="w-6 text-right">{v}</span>
            <span className="h-px flex-1 bg-border/60" />
          </div>
        ))}
      </div>
      <div className="absolute inset-0 ml-8 flex items-end justify-between gap-2 pb-5">
        {data.map((p) => (
          <div key={p.d} className="flex flex-1 flex-col items-center gap-1">
            <div className="relative flex h-[150px] w-full items-end justify-center gap-0.5">
              <div
                className="w-2 rounded-t bg-primary"
                style={{ height: `${(p.total / max) * 100}%` }}
              />
              <div
                className="w-2 rounded-t bg-[oklch(0.7_0.18_25)]"
                style={{ height: `${(p.daily / max) * 100 * 6}%` }}
              />
            </div>
            <span className="text-[9px] text-muted-foreground">{p.d}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StoryPreview() {
  return (
    <div className="relative mx-auto aspect-[9/16] w-full max-w-[240px] overflow-hidden rounded-2xl bg-[linear-gradient(160deg,#1e1b4b_0%,#7e22ce_45%,#db2777_100%)] p-3 text-white shadow-[0_20px_40px_-20px_rgba(219,39,119,0.6)]">
      <div className="flex items-center gap-2">
        <div className="grid h-6 w-6 place-items-center rounded-full bg-white/25 text-[10px] font-bold">
          SP
        </div>
        <span className="text-[10px] font-semibold">segredodapromocao</span>
      </div>

      <div className="mt-3 rounded-lg bg-white/12 p-2 backdrop-blur-sm">
        <div className="mb-1.5 flex h-16 items-center justify-center rounded-md bg-white/20 text-[10px] text-white/70">
          imagem do produto
        </div>
        <p className="text-[10px] font-bold leading-tight text-white">
          FONE BLUETOOTH TWS PRO
        </p>
        <p className="mt-1 text-[9px] text-white/70 line-through">
          De R$ 199,90
        </p>
        <p className="text-[13px] font-black text-yellow-300">R$ 79,90</p>
      </div>

      <div className="absolute inset-x-3 bottom-3 rounded-lg bg-white/90 px-2 py-1.5 text-center text-[9px] font-bold uppercase leading-tight text-pink-700">
        Corre que vai acabar!
        <br />
        Comente: EU QUERO e receba o link
      </div>
    </div>
  );
}

/* -------- InstaSched tab -------- */

type SchedStatus = "agendado" | "enviado" | "falha";

type SchedItem = {
  id: string;
  kind: "STORIES" | "FEED" | "REELS";
  title: string;
  priceOriginal: string;
  price: string;
  hue: number;
  emoji: string;
  status: SchedStatus;
  when: string;
};

const SCHED_ITEMS: SchedItem[] = [
  { id: "s1", kind: "STORIES", title: "VESTIDO MIDI FLORAL VERÃO", priceOriginal: "R$ 189,90", price: "R$ 79,90", hue: 340, emoji: "👗", status: "agendado", when: "22/07/2026 23:09" },
  { id: "s2", kind: "STORIES", title: "FONE BLUETOOTH TWS PRO 5.3", priceOriginal: "R$ 299,90", price: "R$ 119,90", hue: 250, emoji: "🎧", status: "agendado", when: "22/07/2026 23:14" },
  { id: "s3", kind: "STORIES", title: "KIT PANELAS ANTIADERENTE 5 PÇ", priceOriginal: "R$ 459,00", price: "R$ 199,90", hue: 25, emoji: "🍳", status: "agendado", when: "22/07/2026 23:22" },
  { id: "s4", kind: "STORIES", title: "JOGO CAMA QUEEN 200 FIOS", priceOriginal: "R$ 349,00", price: "R$ 149,90", hue: 200, emoji: "🛏️", status: "enviado", when: "22/07/2026 21:00" },
  { id: "s5", kind: "STORIES", title: "TÊNIS CORRIDA MASCULINO", priceOriginal: "R$ 399,90", price: "R$ 189,90", hue: 160, emoji: "👟", status: "agendado", when: "23/07/2026 08:00" },
  { id: "s6", kind: "STORIES", title: "AR CONDICIONADO PORTÁTIL 12000", priceOriginal: "R$ 2.499,00", price: "R$ 1.799,00", hue: 210, emoji: "❄️", status: "falha", when: "22/07/2026 20:32" },
  { id: "s7", kind: "STORIES", title: "SMART TV 50\" 4K UHD", priceOriginal: "R$ 3.299,00", price: "R$ 2.299,00", hue: 280, emoji: "📺", status: "agendado", when: "23/07/2026 09:00" },
  { id: "s8", kind: "STORIES", title: "KIT SKINCARE ANTI-IDADE", priceOriginal: "R$ 259,00", price: "R$ 129,90", hue: 320, emoji: "🧴", status: "agendado", when: "23/07/2026 12:00" },
];

function InstaSchedPanel() {
  const [status, setStatus] = useState<"todos" | SchedStatus>("todos");
  const [order, setOrder] = useState<"recentes" | "antigos">("recentes");

  const filtered = SCHED_ITEMS.filter((i) => status === "todos" || i.status === status);
  const sorted = [...filtered].sort((a, b) =>
    order === "recentes" ? a.when.localeCompare(b.when) : b.when.localeCompare(a.when),
  );

  return (
    <div className="mt-6 space-y-6">
      {/* Header banner */}
      <div className="relative overflow-hidden rounded-2xl border border-border/70 p-6 text-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_40px_-24px_rgba(220,80,20,0.55)]">
        <div className="absolute inset-0 bg-[linear-gradient(115deg,#feda75_0%,#fa7e1e_30%,#f43b5a_65%,#d62976_100%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/20 backdrop-blur">
              <Calendar className="h-6 w-6" strokeWidth={2.2} />
            </span>
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">
                📅 Agendamentos Instagram
              </h2>
              <p className="text-[13px] text-white/90">
                <span className="font-semibold">@segredodapromocao</span> ·{" "}
                <span className="font-semibold">43 slots</span> disponíveis nas
                próximas 24h
                <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
                  limite 50 · janela 24:00
                </span>
              </p>
            </div>
          </div>
          <Button className="h-10 rounded-full bg-white px-5 font-bold text-[oklch(0.55_0.22_25)] shadow-sm hover:bg-white/95">
            <Sparkles className="mr-1.5 h-4 w-4" />+ Novo Agendamento
          </Button>
        </div>

        {/* capacity bar */}
        <div className="relative mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/25">
          <div className="h-full w-[14%] bg-white/90" />
        </div>
        <div className="relative mt-1 flex justify-between text-[10px] font-medium uppercase tracking-wider text-white/80">
          <span>7 agendados</span>
          <span>50 disponíveis / 24h</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.08)] sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Estado
          </label>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: "todos", label: "Todos" },
              { id: "agendado", label: "Agendado" },
              { id: "enviado", label: "Enviado" },
              { id: "falha", label: "Falha" },
            ].map((s) => {
              const on = status === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setStatus(s.id as typeof status)}
                  className={cn(
                    "h-9 rounded-lg border px-3 text-[12px] font-semibold transition-all",
                    on
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-background text-foreground/70 hover:border-primary/40",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="sm:w-[320px]">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Ordenação
          </label>
          <button
            type="button"
            onClick={() =>
              setOrder((o) => (o === "recentes" ? "antigos" : "recentes"))
            }
            className="flex h-10 w-full items-center justify-between rounded-lg border border-border bg-background px-3 text-sm text-foreground hover:border-primary/40"
          >
            <span>
              Ordenado por agendamento (
              {order === "recentes" ? "recentes primeiro" : "antigos primeiro"})
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sorted.map((item) => (
          <SchedCard key={item.id} item={item} />
        ))}
      </div>

      {sorted.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhum agendamento nesse filtro.
        </div>
      )}
    </div>
  );
}

function SchedCard({ item }: { item: SchedItem }) {
  const statusMap: Record<
    SchedStatus,
    { label: string; dot: string; text: string; bg: string }
  > = {
    agendado: {
      label: "Agendado",
      dot: "bg-[oklch(0.72_0.19_55)]",
      text: "text-[oklch(0.45_0.18_45)]",
      bg: "bg-[oklch(0.98_0.05_75)]",
    },
    enviado: {
      label: "Enviado",
      dot: "bg-emerald-500",
      text: "text-emerald-700",
      bg: "bg-emerald-50",
    },
    falha: {
      label: "Falha",
      dot: "bg-red-500",
      text: "text-red-700",
      bg: "bg-red-50",
    },
  };
  const st = statusMap[item.status];

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.1)] transition-all hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_40px_-20px_rgba(15,23,42,0.18)]">
      {/* preview */}
      <div className="relative">
        <span className="absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-[oklch(0.72_0.18_45)] to-[oklch(0.62_0.22_25)] px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-sm">
          <Instagram className="h-3 w-3" strokeWidth={2.6} />
          {item.kind}
        </span>

        <StoryPreviewCard item={item} />
      </div>

      {/* meta */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="line-clamp-2 min-h-[36px] font-display text-[13px] font-bold leading-snug text-foreground">
            {item.title}
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[11px] text-muted-foreground line-through">
              {item.priceOriginal}
            </span>
            <span className="text-[13px] font-bold text-[oklch(0.55_0.22_25)]">
              {item.price}
            </span>
          </div>
        </div>

        <div
          className={cn(
            "flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5",
            st.bg,
          )}
        >
          <span className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", st.dot)} />
            <span className={cn("text-[11px] font-semibold", st.text)}>
              {st.label}
            </span>
          </span>
          <span className="flex items-center gap-1 text-[11px] font-medium text-foreground/75">
            <Calendar className="h-3 w-3" />
            {item.when}
          </span>
        </div>

        <div className="mt-1 flex items-center justify-between border-t border-border/60 pt-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold text-primary hover:bg-primary/10"
          >
            <Palette className="h-3.5 w-3.5" />
            Editar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Excluir
          </Button>
        </div>
      </div>
    </div>
  );
}

function StoryPreviewCard({ item }: { item: SchedItem }) {
  return (
    <div
      className="relative aspect-[9/12] w-full overflow-hidden text-white"
      style={{
        backgroundImage: `linear-gradient(160deg, oklch(0.35 0.14 ${item.hue}) 0%, oklch(0.55 0.22 ${item.hue}) 60%, oklch(0.7 0.2 ${(item.hue + 30) % 360}) 100%)`,
      }}
    >
      {/* faux product photo */}
      <div className="absolute left-1/2 top-[42%] flex h-[52%] w-[72%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl bg-white/15 text-5xl shadow-inner backdrop-blur-sm">
        <span>{item.emoji}</span>
      </div>

      {/* header */}
      <div className="absolute left-3 right-3 top-3 flex items-center gap-2">
        <div className="grid h-6 w-6 place-items-center rounded-full bg-white/25 text-[9px] font-bold">
          SP
        </div>
        <span className="text-[10px] font-semibold drop-shadow-sm">
          segredodapromocao
        </span>
      </div>

      {/* price badge */}
      <div className="absolute right-3 top-12 rounded-lg bg-yellow-300 px-2 py-1 text-[11px] font-black text-neutral-900 shadow-md">
        {item.price}
      </div>

      {/* footer CTA */}
      <div className="absolute inset-x-3 bottom-3 rounded-md bg-white/95 px-2 py-1 text-center text-[9px] font-black uppercase leading-tight text-[oklch(0.5_0.22_25)]">
        Corre! Comente EU QUERO
      </div>
    </div>
  );
}

/* -------- InstaBotHelp tab -------- */

type ReelItem = {
  id: string;
  caption: string;
  likes: number;
  comments: number;
  hue: number;
  emoji: string;
  label: string;
};

const REELS: ReelItem[] = [
  { id: "r1", caption: "Achadinho da Shopee que TODO MUNDO tá querendo 🔥 comenta EU QUERO", likes: 0, comments: 0, hue: 25, emoji: "🛍️", label: "Achadinho Shopee" },
  { id: "r2", caption: "Testei esse organizador de gaveta e mudou minha vida 🤯", likes: 12, comments: 3, hue: 200, emoji: "🧺", label: "Organizador" },
  { id: "r3", caption: "Look completo por menos de R$ 100 na Shein — comenta LINK", likes: 48, comments: 21, hue: 330, emoji: "👗", label: "Look Shein" },
  { id: "r4", caption: "Cozinha aesthetic com esses achados de Amazon 🍳✨", likes: 5, comments: 1, hue: 45, emoji: "🍳", label: "Cozinha" },
  { id: "r5", caption: "Fone TWS com cancelamento ativo por R$ 119 🎧 corre!", likes: 132, comments: 44, hue: 260, emoji: "🎧", label: "Fone TWS" },
  { id: "r6", caption: "Kit skincare que virou febre no TikTok 🧴 achei mais barato", likes: 76, comments: 18, hue: 320, emoji: "🧴", label: "Skincare" },
  { id: "r7", caption: "Utilidades para banheiro que valem cada centavo 🚿", likes: 0, comments: 0, hue: 190, emoji: "🚿", label: "Banheiro" },
  { id: "r8", caption: "Tênis chunky viral por menos de R$ 200 👟", likes: 210, comments: 63, hue: 150, emoji: "👟", label: "Tênis" },
];

const REMIX: ReelItem[] = [
  { id: "m1", caption: "REMIX: reagi ao vídeo viral do achado de cozinha 🍳", likes: 22, comments: 4, hue: 45, emoji: "🍳", label: "Remix Cozinha" },
  { id: "m2", caption: "REMIX: testei o organizador viral do TikTok", likes: 61, comments: 12, hue: 200, emoji: "🧺", label: "Remix Organizador" },
  { id: "m3", caption: "REMIX: unboxing do fone TWS mais pedido", likes: 88, comments: 27, hue: 260, emoji: "🎧", label: "Remix Fone" },
  { id: "m4", caption: "REMIX: skincare rotina de 3 passos", likes: 34, comments: 7, hue: 320, emoji: "🧴", label: "Remix Skincare" },
];

function InstaBotHelpPanel() {
  const [mode, setMode] = useState<"reels" | "remix">("reels");
  const items = mode === "reels" ? REELS : REMIX;

  return (
    <div className="mt-6 space-y-6">
      {/* Header banner */}
      <div className="relative overflow-hidden rounded-2xl border border-border/70 p-6 text-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_40px_-24px_rgba(220,80,120,0.55)]">
        <div className="absolute inset-0 bg-[linear-gradient(115deg,#4f5bd5_0%,#962fbf_40%,#d62976_70%,#fa7e1e_100%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/20 backdrop-blur">
              <Sparkles className="h-6 w-6" strokeWidth={2.2} />
            </span>
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">
                🤖 InstaBotHelp
              </h2>
              <p className="text-[13px] text-white/90">
                Gerencie automações de comentários em{" "}
                <span className="font-semibold">Reels</span> e{" "}
                <span className="font-semibold">Remix</span> de{" "}
                <span className="font-semibold">@segredodapromocao</span>
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="inline-flex items-center gap-1 rounded-full bg-white/15 p-1 backdrop-blur">
            {[
              { id: "reels", label: "📷 Reels" },
              { id: "remix", label: "🎬 Remix" },
            ].map((t) => {
              const on = mode === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setMode(t.id as typeof mode)}
                  className={cn(
                    "h-9 rounded-full px-4 text-[13px] font-semibold transition-all",
                    on
                      ? "bg-white text-[oklch(0.45_0.22_320)] shadow-sm"
                      : "text-white/85 hover:bg-white/10",
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((r) => (
          <ReelCard key={r.id} item={r} />
        ))}
      </div>
    </div>
  );
}

function ReelCard({ item }: { item: ReelItem }) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.1)] transition-all hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_40px_-20px_rgba(15,23,42,0.18)]">
      {/* Thumbnail */}
      <div
        className="relative aspect-[9/14] w-full overflow-hidden"
        style={{
          backgroundImage: `linear-gradient(160deg, oklch(0.3 0.12 ${item.hue}) 0%, oklch(0.5 0.2 ${item.hue}) 55%, oklch(0.7 0.2 ${(item.hue + 30) % 360}) 100%)`,
        }}
      >
        {/* faux content */}
        <div className="absolute inset-0 flex items-center justify-center text-7xl drop-shadow-lg">
          {item.emoji}
        </div>

        {/* subtle grain */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_60%)]" />

        {/* Top-left label */}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md bg-black/40 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
          <Instagram className="h-3 w-3" strokeWidth={2.6} />
          Reels
        </span>

        {/* Play hint */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-white/25 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
            <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 fill-white">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </div>

        {/* Floating metrics */}
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between rounded-lg bg-black/45 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-md">
          <span className="flex items-center gap-1.5">
            <span>👍</span>
            <span>{item.likes}</span>
            <span className="text-white/70">likes</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span>💬</span>
            <span>{item.comments}</span>
            <span className="text-white/70">coment.</span>
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="line-clamp-3 min-h-[54px] text-[12.5px] leading-snug text-foreground/85">
          {item.caption}
        </p>

        <div className="mt-auto grid grid-cols-2 gap-2">
          <Button
            size="sm"
            className="h-9 gap-1.5 rounded-lg bg-gradient-to-r from-[oklch(0.62_0.22_25)] to-[oklch(0.55_0.24_15)] text-[12px] font-semibold text-white shadow-[0_8px_18px_-10px_rgba(220,50,50,0.55)] hover:opacity-95"
          >
            <Instagram className="h-3.5 w-3.5" />
            Ver no IG
          </Button>
          <Button
            size="sm"
            className="h-9 gap-1.5 rounded-lg bg-gradient-to-r from-[oklch(0.72_0.18_150)] to-[oklch(0.6_0.2_155)] text-[12px] font-semibold text-white shadow-[0_8px_18px_-10px_rgba(20,160,90,0.55)] hover:opacity-95"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Nova automação
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------- WhatsApp Groups tab -------- */

const WA_GROUPS = [
  { id: "g1", name: "#4 SEGREDO DAS PROMOÇÕES 🛍️👜", members: 512, selected: true },
  { id: "g2", name: "#2 PROMOS DA CONFEITARIA 🍰", members: 214, selected: true },
  { id: "g3", name: "MUNDO FITNESS PROMO 💪", members: 187, selected: false },
  { id: "g4", name: "Mariah Modas ✨", members: 96, selected: false },
  { id: "g5", name: "SEGREDOS DAS MAMÃES 👶", members: 340, selected: true },
  { id: "g6", name: "• LÍVIA KIDS •", members: 128, selected: false },
  { id: "g7", name: "OFERTAS RELÂMPAGO ⚡", members: 780, selected: false },
  { id: "g8", name: "Cupons Shopee 🧡", members: 462, selected: true },
  { id: "g9", name: "Casa & Decoração 🏠", members: 156, selected: false },
  { id: "g10", name: "Beleza em Alta 💄", members: 274, selected: false },
  { id: "g11", name: "Tech Deals BR 💻", members: 611, selected: false },
  { id: "g12", name: "PET LOVERS 🐾", members: 198, selected: false },
  { id: "g13", name: "Livraria Segredo 📚", members: 89, selected: false },
  { id: "g14", name: "MODA PLUS SIZE 👗", members: 305, selected: false },
];

const WA_CHANNELS = [
  { id: "c1", name: "📢 Segredo News", members: 4210, selected: true },
  { id: "c2", name: "📢 Ofertas Diárias", members: 2870, selected: false },
  { id: "c3", name: "📢 Cupons Premium", members: 1120, selected: false },
];

function WhatsAppGroupsPanel() {
  const [subTab, setSubTab] = useState<"grupos" | "canais">("grupos");
  const [noImage, setNoImage] = useState(false);
  const [groups, setGroups] = useState(WA_GROUPS);
  const [channels, setChannels] = useState(WA_CHANNELS);

  const list = subTab === "grupos" ? groups : channels;
  const setList = subTab === "grupos" ? setGroups : setChannels;
  const toggle = (id: string) =>
    setList((prev: any) => prev.map((g: any) => (g.id === id ? { ...g, selected: !g.selected } : g)));

  const selectedCount = list.filter((g) => g.selected).length;

  return (
    <div className="mt-6 space-y-6">
      <WhatsAppConnectionCard />

      {/* WhatsApp Web / Passkey solution */}
      <div className="overflow-hidden rounded-2xl border border-[oklch(0.85_0.12_150)] bg-gradient-to-br from-[oklch(0.97_0.05_150)] to-[oklch(0.95_0.06_155)] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-18px_rgba(20,150,90,0.35)]">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[oklch(0.72_0.18_150)] to-[oklch(0.58_0.2_155)] text-white shadow-lg">
            <Sparkles className="h-6 w-6" strokeWidth={2.4} />
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[oklch(0.42_0.15_155)]">
                ⭐ Novidade
              </span>
              <h2 className="mt-2 font-display text-xl font-bold text-foreground">
                Solução definitiva para conectar o WhatsApp
              </h2>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-foreground/75">
                O WhatsApp Web agora exige uma <b>chave de acesso (passkey)</b> para manter a sessão ativa. Instale a nossa extensão oficial, copie o token gerado abaixo e cole na extensão para conectar sua conta em segundos — sem precisar escanear QR code toda semana.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-[oklch(0.85_0.1_150)] bg-white px-3 py-2 font-mono text-[12px] text-foreground/80">
                <span className="text-muted-foreground">Token:</span>
                <span className="font-semibold text-foreground">dvl_wa_a91f•••4c72</span>
                <button className="ml-1 text-primary hover:underline">Copiar</button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button className="gap-2 rounded-lg bg-gradient-to-r from-[oklch(0.62_0.22_255)] to-[oklch(0.55_0.24_260)] text-white shadow-sm hover:opacity-95">
                <Chrome className="h-4 w-4" /> Instalar Extensão do Chrome
              </Button>
              <Button variant="outline" className="gap-2 rounded-lg border-border/70 bg-white">
                <PlayCircle className="h-4 w-4" /> Assistir vídeo tutorial
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Sessões WhatsApp */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-[15px] font-bold uppercase tracking-wider text-foreground">
              Sessões WhatsApp
            </h3>
            <span className="rounded-md bg-gradient-to-r from-[oklch(0.78_0.16_75)] to-[oklch(0.68_0.18_60)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
              Premium
            </span>
          </div>
          <span className="text-[12px] font-semibold text-muted-foreground">
            <span className="text-foreground">1</span>/5 sessões
          </span>
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-[oklch(0.72_0.18_150)] to-[oklch(0.55_0.2_155)] font-display text-xl font-bold text-white">
                SP
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-card bg-[oklch(0.72_0.18_150)] text-white">
                <MessageCircle className="h-2.5 w-2.5" strokeWidth={3} />
              </span>
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground">Segredo das Promoções</p>
              <p className="text-[12.5px] text-muted-foreground">+55 (11) 98452-1207</p>
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[oklch(0.94_0.08_150)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[oklch(0.42_0.15_155)]">
                <Check className="h-2.5 w-2.5" strokeWidth={3.5} /> Conectado
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="rounded-lg">Desvincular</Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-lg border-[oklch(0.9_0.06_25)] text-[color:var(--color-danger)] hover:bg-[oklch(0.97_0.03_25)]"
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir sessão
            </Button>
          </div>
        </div>
      </section>

      {/* Operational alerts */}
      <div className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
        <div className="flex items-start gap-3 rounded-xl border border-[oklch(0.88_0.09_15)] bg-[oklch(0.98_0.03_15)] p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[oklch(0.6_0.2_20)]" />
          <p className="text-[13px] leading-relaxed text-foreground/85">
            <b>Leia com atenção!</b> Este recurso <b>não utiliza a API oficial</b> do WhatsApp. Selecione os grupos/canais desejados e clique em <b>Salvar</b>. O uso é de sua responsabilidade.
          </p>
        </div>
        <a
          href="#"
          className="flex items-start gap-3 rounded-xl border border-[oklch(0.88_0.08_240)] bg-[oklch(0.97_0.03_240)] p-4 transition-colors hover:bg-[oklch(0.96_0.04_240)]"
        >
          <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-[oklch(0.55_0.18_245)]" />
          <p className="text-[13px] leading-relaxed text-foreground/85">
            <b>💬 Dúvidas?</b> Clique aqui para ver o <span className="text-primary underline">vídeo de ajuda</span>.
          </p>
        </a>
      </div>

      {/* Sub tabs Grupos vs Canais */}
      <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl bg-muted/60 p-1">
            <button
              onClick={() => setSubTab("grupos")}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold transition-all",
                subTab === "grupos"
                  ? "bg-white text-foreground shadow-sm"
                  : "text-foreground/60 hover:text-foreground",
              )}
            >
              <Users className="h-4 w-4" />
              Grupos
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                  subTab === "grupos" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {groups.length}
              </span>
            </button>
            <button
              onClick={() => setSubTab("canais")}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold transition-all",
                subTab === "canais"
                  ? "bg-white text-foreground shadow-sm"
                  : "text-foreground/60 hover:text-foreground",
              )}
            >
              📢 Canais / Newsletters
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                  subTab === "canais" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {channels.length}
              </span>
            </button>
          </div>

          <Button variant="outline" size="sm" className="gap-1.5 rounded-lg">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </Button>
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-xl border border-[oklch(0.88_0.09_75)] bg-[oklch(0.98_0.05_80)] p-3.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.55_0.18_70)]" />
          <p className="text-[12.5px] leading-relaxed text-foreground/85">
            <b>ATUALIZAÇÃO:</b> agora serão exibidos <b>todos</b> os grupos do WhatsApp, independentemente de você ser administrador ou dono.
          </p>
        </div>

        {/* List */}
        <div className="mt-4 flex items-center justify-between px-1 text-[12px]">
          <span className="font-semibold text-foreground/70">
            {selectedCount} de {list.length} selecionados
          </span>
          <div className="flex gap-3 text-[12px] font-medium text-primary">
            <button className="hover:underline" onClick={() => setList((p: any) => p.map((g: any) => ({ ...g, selected: true })))}>Selecionar todos</button>
            <button className="hover:underline" onClick={() => setList((p: any) => p.map((g: any) => ({ ...g, selected: false })))}>Limpar</button>
          </div>
        </div>

        <ul className="mt-2 divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-background/40">
          {list.map((g) => (
            <li key={g.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50",
                  g.selected && "bg-[oklch(0.98_0.03_150)]",
                )}
              >
                <span
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-all",
                    g.selected
                      ? "border-[oklch(0.55_0.2_155)] bg-[oklch(0.55_0.2_155)] text-white"
                      : "border-border bg-white",
                  )}
                >
                  {g.selected && <Check className="h-3 w-3" strokeWidth={3.5} />}
                </span>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={g.selected}
                  onChange={() => toggle(g.id)}
                />
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[oklch(0.9_0.05_155)] to-[oklch(0.82_0.09_150)] font-display text-[13px] font-bold text-[oklch(0.35_0.15_155)]">
                  {g.name.replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-foreground">{g.name}</p>
                  <p className="text-[11.5px] text-muted-foreground">{g.members} membros</p>
                </div>
                {g.selected && (
                  <span className="rounded-full bg-[oklch(0.94_0.08_150)] px-2 py-0.5 text-[10px] font-bold uppercase text-[oklch(0.42_0.15_155)]">
                    Ativo
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>

        {/* Data saver + save */}
        <div className="mt-5 flex flex-col gap-4 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-start gap-3">
            <span
              onClick={() => setNoImage((v) => !v)}
              className={cn(
                "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-all",
                noImage
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-white",
              )}
            >
              {noImage && <Check className="h-3 w-3" strokeWidth={3.5} />}
            </span>
            <span className="text-[13px] leading-snug">
              <span className="font-semibold text-foreground">Não enviar imagem (economizar dados)</span>
              <span className="mt-0.5 block text-[12px] text-muted-foreground">
                O WhatsApp carrega automaticamente a prévia do link, então a imagem se torna opcional na maioria dos casos.
              </span>
            </span>
          </label>

          <Button
            size="lg"
            className="gap-2 rounded-full bg-primary px-8 shadow-[0_10px_30px_-12px_oklch(0.62_0.19_256/0.6)] hover:bg-primary/90"
          >
            <Save className="h-4 w-4" /> Salvar configurações
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------- WhatsApp Monitor tab -------- */

const WA_MONITOR_GROUPS = [
  "(grupo sem nome)",
  "#2 PROMOS DA CONFEITARIA",
  "AGN compra vende e aluga",
  "Ajudar o Hernandes",
  "Casas",
  "Conjunto chvm",
  "MUNDO FITNESS PROMO 🛍️🏋️",
  "Mariah Modas 💗",
  "PROGRAMA LUTA POR MORADIA",
  "PROGRAMA LUTA POR MORADIA #2",
  "PROGRAMA LUTA POR MORADIA #3",
  "Programa Luta por Moradia 2",
  "SEGREDOS DAS MAMÃES | #1",
  "🍭 • LÍVIA KIDS • 🍭",
];

const MAX_MONITOR = 5;

function WhatsAppMonitorPanel() {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (name: string) => {
    setSelected((prev) => {
      if (prev.includes(name)) return prev.filter((n) => n !== name);
      if (prev.length >= MAX_MONITOR) return prev;
      return [...prev, name];
    });
  };

  const count = selected.length;
  const atLimit = count >= MAX_MONITOR;

  return (
    <div className="mt-6">
      <div className="mx-auto max-w-[1100px] overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-18px_rgba(15,23,42,0.12)]">
        {/* Header */}
        <div className="flex flex-col gap-3 border-b border-border/60 bg-gradient-to-br from-white to-[oklch(0.98_0.02_240)] p-6 sm:flex-row sm:items-start">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[oklch(0.68_0.15_235)] to-[oklch(0.55_0.18_245)] text-white shadow-sm">
            <span className="text-xl">🔍</span>
          </div>
          <div className="flex-1">
            <h2 className="font-display text-xl font-bold text-foreground">
              Monitorar Grupos para Captura de Links
            </h2>
            <p className="mt-1.5 max-w-[720px] text-[13.5px] leading-relaxed text-foreground/70">
              Selecione até <b>5 grupos</b> que o sistema irá monitorar. Quando um link de e-commerce (
              <b>Amazon</b>, <b>Shopee</b>, <b>AliExpress</b> etc.) for compartilhado nesses grupos, ele
              será capturado e adicionado automaticamente ao seu painel.
            </p>
          </div>
        </div>

        {/* Status bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/30 px-6 py-3.5">
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-wider",
              atLimit
                ? "bg-[oklch(0.94_0.08_75)] text-[oklch(0.45_0.15_65)]"
                : "bg-[oklch(0.94_0.05_240)] text-[oklch(0.42_0.16_250)]",
            )}
          >
            <span
              className={cn(
                "grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-black",
                atLimit
                  ? "bg-[oklch(0.7_0.18_65)] text-white"
                  : "bg-[oklch(0.55_0.18_250)] text-white",
              )}
            >
              {count}/{MAX_MONITOR}
            </span>
            grupos selecionados
          </span>

          <Button variant="outline" size="sm" className="gap-1.5 rounded-lg">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar lista de grupos
          </Button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3">
          {WA_MONITOR_GROUPS.map((name) => {
            const checked = selected.includes(name);
            const disabled = !checked && atLimit;
            return (
              <label
                key={name}
                className={cn(
                  "group flex cursor-pointer items-center gap-3 rounded-xl border bg-background p-3.5 transition-all",
                  checked
                    ? "border-[oklch(0.68_0.15_235)] bg-[oklch(0.98_0.03_240)] shadow-[0_6px_18px_-12px_oklch(0.55_0.18_245/0.6)]"
                    : "border-border/70 hover:border-border hover:bg-muted/40",
                  disabled && "cursor-not-allowed opacity-50 hover:bg-background",
                )}
              >
                <span
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-all",
                    checked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-white",
                  )}
                >
                  {checked && <Check className="h-3 w-3" strokeWidth={3.5} />}
                </span>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() => !disabled && toggle(name)}
                />
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[oklch(0.9_0.05_155)] to-[oklch(0.82_0.09_150)] font-display text-[12px] font-bold text-[oklch(0.35_0.15_155)]">
                  {name.replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 2).toUpperCase() || "?"}
                </div>
                <span className="truncate text-[13px] font-medium text-foreground">{name}</span>
              </label>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-muted-foreground">
            {atLimit
              ? "Limite máximo atingido. Desmarque um grupo para trocar."
              : `Você pode selecionar mais ${MAX_MONITOR - count} grupo${MAX_MONITOR - count === 1 ? "" : "s"}.`}
          </p>
          <Button
            size="lg"
            className="gap-2 rounded-full bg-primary px-8 shadow-[0_10px_30px_-12px_oklch(0.62_0.19_256/0.6)] hover:bg-primary/90"
          >
            <Save className="h-4 w-4" /> Salvar grupos monitorados
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------- Mercado Livre tab -------- */

const ML_CATEGORIES = [
  "Selecione uma categoria",
  "Eletrônicos, Áudio e Vídeo",
  "Celulares e Telefones",
  "Informática",
  "Casa, Móveis e Decoração",
  "Beleza e Cuidado Pessoal",
  "Esportes e Fitness",
  "Saúde",
  "Ferramentas",
  "Alimentos e Bebidas",
];

const ML_HEADERS = [
  "Cabeçalho Padrão",
  "🔥 Oferta Relâmpago",
  "⚡ Promoção Imperdível",
  "💥 Só Hoje",
];

type MLProduct = {
  id: string;
  title: string;
  emoji: string;
  color: string;
  format: "STORY" | "FEED";
  price: string;
  original: string;
  discount: number;
  when: string;
};

const ML_PRODUCTS: MLProduct[] = [
  { id: "1", title: "Isofort WPI Whey Protein Isolado 900g Baunilha - Vitafor", emoji: "🥤", color: "oklch(0.92 0.06 80)", format: "STORY", price: "R$ 189,90", original: "R$ 289,00", discount: 34, when: "Hoje 09:12" },
  { id: "2", title: "Whey Protein Growth Supplements 1kg Chocolate", emoji: "💪", color: "oklch(0.88 0.09 40)", format: "FEED", price: "R$ 99,90", original: "R$ 159,90", discount: 38, when: "Hoje 08:47" },
  { id: "3", title: "Bolsa Térmica Marmita Fitness Impermeável 8 Litros", emoji: "🧊", color: "oklch(0.9 0.07 200)", format: "FEED", price: "R$ 49,90", original: "R$ 89,00", discount: 44, when: "Ontem 22:03" },
  { id: "4", title: "Kit Monitor de Pressão Arterial Digital de Braço G-Tech", emoji: "🩺", color: "oklch(0.92 0.06 150)", format: "STORY", price: "R$ 139,90", original: "R$ 219,00", discount: 36, when: "Ontem 18:20" },
  { id: "5", title: "Balança Digital Corporal Bioimpedância Bluetooth 180kg", emoji: "⚖️", color: "oklch(0.9 0.05 260)", format: "FEED", price: "R$ 79,90", original: "R$ 149,90", discount: 47, when: "Ontem 14:11" },
  { id: "6", title: "Testo Essencial Estimulante Masculino 60 Cápsulas", emoji: "💊", color: "oklch(0.88 0.09 20)", format: "STORY", price: "R$ 59,90", original: "R$ 129,90", discount: 54, when: "Ontem 11:04" },
  { id: "7", title: "Seringa de Insulina 1ml BD Ultra Fine com Agulha 100un", emoji: "💉", color: "oklch(0.92 0.05 220)", format: "FEED", price: "R$ 74,90", original: "R$ 109,00", discount: 31, when: "2 dias atrás" },
  { id: "8", title: "Percarbonato de Sódio Puro 1kg Tira Manchas Multiuso", emoji: "🧴", color: "oklch(0.9 0.07 180)", format: "FEED", price: "R$ 34,90", original: "R$ 59,90", discount: 42, when: "2 dias atrás" },
];

// Real Mercado Livre category ids (BR site).
const ML_CATEGORY_MAP: Record<string, string | null> = {
  "Selecione uma categoria": null,
  "Eletrônicos, Áudio e Vídeo": "MLB1000",
  "Celulares e Telefones": "MLB1051",
  "Informática": "MLB1648",
  "Casa, Móveis e Decoração": "MLB1574",
  "Beleza e Cuidado Pessoal": "MLB1246",
  "Esportes e Fitness": "MLB1276",
  "Saúde": "MLB1276",
  "Ferramentas": "MLB263532",
  "Alimentos e Bebidas": "MLB1403",
};

type MLSearchItem = {
  id: string;
  title: string;
  price: number | null;
  originalPrice: number | null;
  discount: number | null;
  thumbnail: string | null;
  permalink: string;
};

function formatBRL(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function MercadoLivrePanel() {
  const [autoAffiliate, setAutoAffiliate] = useState(true);
  const [bestSellers, setBestSellers] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const allChecked = ML_PRODUCTS.every((p) => selected[p.id]);

  // === Add by link ===
  const [linkInput, setLinkInput] = useState("");
  const [addingLink, setAddingLink] = useState(false);

  // === Search ===
  const [categoryLabel, setCategoryLabel] = useState<string>(ML_CATEGORIES[0]!);
  const [keyword, setKeyword] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<MLSearchItem[]>([]);
  const [pagination, setPagination] = useState<{ offset: number; limit: number; total: number } | null>(null);
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [searchCtx, setSearchCtx] = useState<{
    mode: "search" | "deals" | "best_sellers";
    query?: string;
    categoryId?: string;
  } | null>(null);

  const addByLinkFn = useServerFn(addMLProductByLink);
  const searchFn = useServerFn(searchMLProducts);
  const addByIdsFn = useServerFn(addMLProductsByIds);

  const handleAddByLink = async () => {
    const link = linkInput.trim();
    if (!link) {
      toast.error("Cole um link do Mercado Livre.");
      return;
    }
    setAddingLink(true);
    try {
      const res = await addByLinkFn({ data: { link } });
      const label = res.inserted > 0 ? "Produto adicionado" : "Produto atualizado";
      toast.success(label, {
        description: `${res.product.title.slice(0, 60)}${res.product.title.length > 60 ? "…" : ""}`,
      });
      if (!res.product.affiliateReady && autoAffiliate) {
        toast.message("Configure sua conta Mercado Livre em Afiliados para gerar link comissionado.");
      }
      setLinkInput("");
    } catch (err) {
      toast.error("Falha ao adicionar produto", {
        description: err instanceof Error ? err.message : "Erro desconhecido.",
      });
    } finally {
      setAddingLink(false);
    }
  };

  const runSearch = async (offset = 0) => {
    const categoryId = ML_CATEGORY_MAP[categoryLabel] ?? undefined;
    const query = keyword.trim() || undefined;
    if (!query && !categoryId && !bestSellers) {
      toast.error("Escolha uma categoria, digite uma palavra ou marque Mais Vendidos.");
      return;
    }
    const mode: "search" | "deals" | "best_sellers" = bestSellers
      ? "best_sellers"
      : query || categoryId
        ? "search"
        : "deals";
    setSearching(true);
    setSearchCtx({ mode, query, categoryId });
    try {
      const res = await searchFn({
        data: { query, categoryId, mode, offset, limit: 24 },
      });
      const items: MLSearchItem[] = res.items.map((i) => ({
        id: i.id,
        title: i.title,
        price: i.price,
        originalPrice: i.originalPrice,
        discount: i.discount,
        thumbnail: i.thumbnail,
        permalink: i.permalink,
      }));
      setResults(items);
      setPagination({ offset: res.offset, limit: res.limit, total: res.total });
      console.log("[ML][panel] busca concluída", {
        termo: query ?? "",
        categoriaId: categoryId ?? null,
        mode,
        total: res.total,
        retornados: items.length,
      });
      if (items.length === 0) {
        toast.message("Nenhum produto encontrado.", {
          description: `Termo: "${query ?? "-"}" · Categoria: ${categoryId ?? "-"} · Total API: ${res.total}`,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido.";
      console.error("[ML][panel] falha na busca", { err });
      toast.error("Falha ao buscar produtos", { description: msg });
    } finally {
      setSearching(false);
    }
  };

  const goToOffset = (offset: number) => {
    if (!searchCtx || !pagination) return;
    void runSearch(Math.max(0, offset));
  };

  const handleAddOne = async (id: string) => {
    setAddingIds((s) => new Set(s).add(id));
    try {
      const res = await addByIdsFn({ data: { ids: [id] } });
      if (res.inserted + res.updated > 0) {
        setAddedIds((s) => new Set(s).add(id));
        toast.success(res.inserted > 0 ? "Produto adicionado" : "Produto atualizado");
      } else {
        toast.error("Não foi possível adicionar este produto.");
      }
    } catch (err) {
      toast.error("Falha ao adicionar", {
        description: err instanceof Error ? err.message : "Erro desconhecido.",
      });
    } finally {
      setAddingIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div className="mt-6 space-y-6">
      {/* Extension notice */}
      <div className="flex flex-col gap-4 rounded-2xl border border-[oklch(0.85_0.06_240)] bg-gradient-to-r from-[oklch(0.97_0.02_240)] to-[oklch(0.98_0.01_220)] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-xl shadow-sm">⭐</div>
          <div>
            <h3 className="text-[15px] font-semibold text-foreground">Novidade! Extensão para Google Chrome</h3>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
              Instale a extensão <b>DivulgaLinks - Captura de Ofertas</b> e adicione produtos do Mercado Livre com apenas <b>1 clique</b> diretamente do navegador!
            </p>
          </div>
        </div>
        <Button className="shrink-0 gap-2 rounded-full bg-primary px-5 shadow-[0_10px_30px_-12px_oklch(0.62_0.19_256/0.6)] hover:bg-primary/90">
          <Download className="h-4 w-4" /> Instalar Extensão
        </Button>
      </div>

      {/* Three columns */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Col 1 - Add by link */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[oklch(0.95_0.03_60)] text-[oklch(0.55_0.19_50)]">
              <Tag className="h-4 w-4" />
            </div>
            <h3 className="text-[14px] font-semibold">Adicionar Produto por Link</h3>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
            Cole qualquer link do produto: <b>URL normal</b>, <b>link de afiliado</b> ou <b>link curto</b>.
          </p>
          <label className="mt-3 flex items-start gap-2 rounded-lg border border-[oklch(0.9_0.06_150)] bg-[oklch(0.97_0.03_150)] p-3">
            <input
              type="checkbox"
              checked={autoAffiliate}
              onChange={(e) => setAutoAffiliate(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[oklch(0.6_0.16_150)]"
            />
            <span className="text-[12px] leading-relaxed text-foreground">
              O sistema irá extrair o produto e gerar seu <b>link de afiliado</b> automaticamente.
            </span>
          </label>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Link</label>
              <Input
                placeholder="https://mercadolivre.com.br/... ou MLB1234567890"
                className="h-10"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !addingLink) void handleAddByLink();
                }}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cabeçalho Dinâmico</label>
              <div className="relative">
                <select className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 pr-9 text-sm">
                  {ML_HEADERS.map((h) => <option key={h}>{h}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Novo Cabeçalho</label>
              <Input placeholder="Digite um cabeçalho personalizado..." className="h-10" />
            </div>
            <Button
              className="w-full gap-2 rounded-full bg-primary hover:bg-primary/90"
              disabled={addingLink}
              onClick={() => void handleAddByLink()}
            >
              <Plus className="h-4 w-4" /> {addingLink ? "Adicionando..." : "Adicionar produto"}
            </Button>
          </div>
        </div>

        {/* Col 2 - Category search */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[oklch(0.95_0.04_240)] text-[oklch(0.55_0.19_256)]">
              <Search className="h-4 w-4" />
            </div>
            <h3 className="text-[14px] font-semibold">Encontrar Ofertas — Mercado Livre</h3>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
            Escolha uma <b>categoria</b>, digite uma <b>palavra-chave</b> ou marque <b>Mais Vendidos</b> para descobrir produtos.
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Categoria</label>
              <div className="relative">
                <select
                  className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 pr-9 text-sm"
                  value={categoryLabel}
                  onChange={(e) => setCategoryLabel(e.target.value)}
                >
                  {ML_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Palavra-chave (opcional)</label>
              <Input
                placeholder="Ex: whey protein"
                className="h-10"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !searching) void runSearch(0);
                }}
              />
            </div>
            <label className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-3">
              <input
                type="checkbox"
                checked={bestSellers}
                onChange={(e) => setBestSellers(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[oklch(0.62_0.19_256)]"
              />
              <span className="text-[12px] leading-relaxed text-foreground">
                Buscar <b>Mais Vendidos</b>
              </span>
            </label>
            <Button
              className="w-full gap-2 rounded-full bg-[oklch(0.62_0.19_256)] hover:bg-[oklch(0.55_0.19_256)]"
              disabled={searching}
              onClick={() => void runSearch(0)}
            >
              <Search className="h-4 w-4" /> {searching ? "Buscando produtos..." : "Buscar ofertas"}
            </Button>
          </div>
        </div>

        {/* Col 3 - Default text */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[oklch(0.95_0.04_60)] text-[oklch(0.6_0.18_50)]">
              <Edit3 className="h-4 w-4" />
            </div>
            <h3 className="text-[14px] font-semibold">Texto Padrão — Mercado Livre</h3>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
            Configure um <b>cabeçalho</b> e um <b>rodapé</b> específicos que substituirão o texto padrão nos produtos da plataforma.
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cabeçalho do Mercado Livre</label>
              <textarea
                rows={3}
                placeholder="🔥 OFERTA MERCADO LIVRE 🔥"
                className="min-h-[80px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <p className="mt-1 text-[10.5px] text-muted-foreground">Substitui o cabeçalho geral apenas para produtos ML.</p>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Rodapé do Mercado Livre</label>
              <textarea
                rows={3}
                placeholder="Frete grátis para todo o Brasil ✅"
                className="min-h-[80px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <Button className="w-full gap-2 rounded-full bg-primary hover:bg-primary/90">
              <Save className="h-4 w-4" /> Salvar textos
            </Button>
          </div>
        </div>
      </div>

      {/* Search results */}
      {(searching || results.length > 0) && (
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-[15px] font-semibold">Resultados da busca</h3>
              <p className="text-[12px] text-muted-foreground">
                {searching
                  ? "Buscando produtos..."
                  : pagination
                    ? `${pagination.offset + 1} – ${pagination.offset + results.length} de ${pagination.total} produtos`
                    : ""}
              </p>
            </div>
            {pagination && !searching && (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-md"
                  disabled={pagination.offset === 0}
                  onClick={() => goToOffset(pagination.offset - pagination.limit)}
                >
                  Anterior
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-md"
                  disabled={pagination.offset + pagination.limit >= pagination.total}
                  onClick={() => goToOffset(pagination.offset + pagination.limit)}
                >
                  Próximo
                </Button>
              </div>
            )}
          </div>

          {searching ? (
            <div className="flex items-center justify-center gap-2 p-10 text-[13px] text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" /> Buscando produtos...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
              {results.map((p) => {
                const isAdding = addingIds.has(p.id);
                const isAdded = addedIds.has(p.id);
                return (
                  <div key={p.id} className="group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-sm transition hover:shadow-md">
                    <div className="relative aspect-square w-full overflow-hidden bg-muted/40">
                      {p.thumbnail ? (
                        <img
                          src={p.thumbnail}
                          alt={p.title}
                          loading="lazy"
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-4xl text-muted-foreground">🛒</div>
                      )}
                      {p.discount != null && p.discount > 0 && (
                        <span className="absolute right-2.5 top-2.5 rounded-md bg-[oklch(0.6_0.22_20)] px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                          -{p.discount}%
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-2 p-3">
                      <p className="line-clamp-2 min-h-[34px] text-[12.5px] font-medium leading-snug text-foreground">
                        {p.title}
                      </p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-[15px] font-bold text-[oklch(0.55_0.19_150)]">{formatBRL(p.price)}</span>
                        {p.originalPrice != null && p.originalPrice > (p.price ?? 0) && (
                          <span className="text-[11px] text-muted-foreground line-through">
                            {formatBRL(p.originalPrice)}
                          </span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        disabled={isAdding || isAdded}
                        onClick={() => void handleAddOne(p.id)}
                        className={cn(
                          "mt-1 h-8 gap-1 rounded-md text-[11.5px]",
                          isAdded
                            ? "bg-[oklch(0.62_0.19_150)] hover:bg-[oklch(0.55_0.19_150)]"
                            : "bg-primary hover:bg-primary/90",
                        )}
                      >
                        {isAdded ? (
                          <><Check className="h-3.5 w-3.5" /> Adicionado</>
                        ) : isAdding ? (
                          <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Adicionando...</>
                        ) : (
                          <><Plus className="h-3.5 w-3.5" /> Adicionar</>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Product list (static placeholder — kept as-is to preserve layout) */}
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <div className="border-b border-border/60 bg-muted/20 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-[15px] font-semibold">Produtos cadastrados</h3>
              <p className="text-[12px] text-muted-foreground">272 produtos vinculados a este canal</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full">
                <RefreshCw className="h-3.5 w-3.5" /> Atualizar
              </Button>
              <Button size="sm" className="h-9 gap-1.5 rounded-full bg-primary hover:bg-primary/90">
                <Plus className="h-3.5 w-3.5" /> Novo produto
              </Button>
            </div>
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-lg border border-[oklch(0.88_0.1_60)] bg-[oklch(0.98_0.04_60)] p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.6_0.19_50)]" />
            <p className="text-[12px] leading-relaxed text-foreground">
              Enviar <b>muitas postagens ao mesmo tempo</b> para o WhatsApp pode causar <b>bloqueio por SPAM</b>. Use com cautela!
            </p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative">
              <select className="h-9 appearance-none rounded-md border border-input bg-background px-3 pr-8 text-[12.5px]">
                <option>12 por página</option>
                <option>24 por página</option>
                <option>48 por página</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
            <div className="relative">
              <select className="h-9 appearance-none rounded-md border border-input bg-background px-3 pr-8 text-[12.5px]">
                <option>Mais novos</option>
                <option>Mais antigos</option>
                <option>Maior desconto</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
            <div className="relative">
              <select className="h-9 appearance-none rounded-md border border-input bg-background px-3 pr-8 text-[12.5px]">
                <option>Todos os envios</option>
                <option>Enviados</option>
                <option>Não enviados</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
            <div className="ml-auto flex items-center gap-2 rounded-lg border border-border/60 bg-background px-2.5 py-1.5">
              <label className="flex items-center gap-1.5 text-[12px]">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => {
                    const v = e.target.checked;
                    const next: Record<string, boolean> = {};
                    ML_PRODUCTS.forEach((p) => (next[p.id] = v));
                    setSelected(next);
                  }}
                  className="h-3.5 w-3.5 accent-[oklch(0.62_0.19_256)]"
                />
                Todos
              </label>
              <div className="relative">
                <select className="h-8 appearance-none rounded-md border border-input bg-background px-2.5 pr-7 text-[12px]">
                  <option>Selecione uma ação...</option>
                  <option>Enviar para grupos</option>
                  <option>Republicar</option>
                  <option>Excluir</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
              <Button size="sm" className="h-8 gap-1.5 rounded-md bg-[oklch(0.62_0.19_150)] px-3 text-[12px] hover:bg-[oklch(0.55_0.19_150)]">
                <Play className="h-3 w-3" /> Executar
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
          {ML_PRODUCTS.map((p) => (
            <div key={p.id} className="group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-sm transition hover:shadow-md">
              <div className="relative aspect-square w-full overflow-hidden" style={{ background: p.color }}>
                <input
                  type="checkbox"
                  checked={!!selected[p.id]}
                  onChange={(e) => setSelected((s) => ({ ...s, [p.id]: e.target.checked }))}
                  className="absolute left-2.5 top-2.5 z-10 h-4 w-4 accent-[oklch(0.62_0.19_256)]"
                />
                <span className={cn(
                  "absolute right-2.5 top-2.5 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm",
                  p.format === "STORY"
                    ? "bg-gradient-to-r from-[oklch(0.6_0.22_20)] to-[oklch(0.55_0.22_320)]"
                    : "bg-gradient-to-r from-[oklch(0.62_0.19_256)] to-[oklch(0.55_0.2_230)]",
                )}>
                  {p.format}
                </span>
                <span className="absolute right-2.5 bottom-2.5 rounded-md bg-[oklch(0.6_0.22_20)] px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                  -{p.discount}%
                </span>
                <div className="flex h-full items-center justify-center text-6xl">{p.emoji}</div>
              </div>

              <div className="flex flex-1 flex-col gap-2 p-3">
                <p className="line-clamp-2 min-h-[34px] text-[12.5px] font-medium leading-snug text-foreground">
                  {p.title}
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-[15px] font-bold text-[oklch(0.55_0.19_150)]">{p.price}</span>
                  <span className="text-[11px] text-muted-foreground line-through">{p.original}</span>
                </div>
                <div className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
                  <Calendar className="h-3 w-3" /> {p.when}
                </div>

                <div className="mt-1 grid grid-cols-3 gap-1.5">
                  <Button size="sm" className="h-8 gap-1 rounded-md bg-[oklch(0.62_0.19_150)] px-1.5 text-[11px] hover:bg-[oklch(0.55_0.19_150)]">
                    <MessageCircle className="h-3 w-3" /> Grupos
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 gap-1 rounded-md px-1.5 text-[11px]">
                    <Edit3 className="h-3 w-3" /> Editar
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 gap-1 rounded-md px-1.5 text-[11px]">
                    <MoreHorizontal className="h-3 w-3" /> Mais
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-5 py-3">
          <p className="text-[12px] text-muted-foreground">Mostrando 1 – 8 de 272 produtos</p>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-8 rounded-md">Anterior</Button>
            <Button size="sm" className="h-8 min-w-[32px] rounded-md bg-primary px-2">1</Button>
            <Button size="sm" variant="outline" className="h-8 min-w-[32px] rounded-md px-2">2</Button>
            <Button size="sm" variant="outline" className="h-8 min-w-[32px] rounded-md px-2">3</Button>
            <Button size="sm" variant="outline" className="h-8 rounded-md">Próximo</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ================== SHOPEE PANEL ==================

const SHOPEE_CATEGORIES = [
  "Acessórios de Moda",
  "Alimentos e Bebidas",
  "Animais Domésticos",
  "Áudio",
  "Automóveis",
  "Beleza",
  "Bolsas Femininas",
  "Bolsas Masculinas",
  "Brinquedos e hobbies",
  "Câmeras e Drones",
  "Casa e Decoração",
  "Celulares e Dispositivos",
  "Computadores e Acessórios",
  "Eletroportáteis",
  "Entrega de Comida",
  "Esportes e Lazer",
  "Ingressos / Cupons / Serviços",
  "Jogos e Consoles",
  "Livros e Revistas",
  "Mãe e Bebê",
  "Moda Infantil",
  "Motocicletas",
  "Papelaria",
  "Relógios",
  "Roupas Femininas",
  "Roupas Masculinas",
  "Sapatos Femininos",
  "Sapatos Masculinos",
  "Saúde",
  "Viagens e Bagagens",
];

type ShopeeTag = { id: string; label: string; type: "cat" | "kw" };

const SHOPEE_TAGS: ShopeeTag[] = [
  { id: "t1", label: "Beleza", type: "cat" },
  { id: "t2", label: "Saúde", type: "cat" },
  { id: "t3", label: "óleo cachos", type: "kw" },
  { id: "t4", label: "Casa e Decoração", type: "cat" },
  { id: "t5", label: "meia térmica", type: "kw" },
  { id: "t6", label: "kit maternidade", type: "kw" },
  { id: "t7", label: "relógio masculino", type: "kw" },
  { id: "t8", label: "Esportes e Lazer", type: "cat" },
];

type ShopeeProduct = {
  id: string;
  title: string;
  emoji: string;
  color: string;
  format: "STORY" | "FEED";
  price: string;
  original: string;
  discount: number;
  when: string;
  affiliateLink?: string;
  rawLink?: string;
  imageUrl?: string;
};


const SHOPEE_PRODUCTS: ShopeeProduct[] = [
  { id: "s1", title: "Gelatina Modeladora Salon Line Todecacho 550g", emoji: "🧴", color: "oklch(0.9 0.06 30)", format: "FEED", price: "R$ 14,90", original: "R$ 29,90", discount: 50, when: "Hoje 10:22" },
  { id: "s2", title: "Chiclete Poosh Kit c/ 40 unidades Sabor Sortido", emoji: "🍬", color: "oklch(0.92 0.08 350)", format: "STORY", price: "R$ 12,49", original: "R$ 24,90", discount: 49, when: "Hoje 09:48" },
  { id: "s3", title: "Kit Saquinhos Maternidade Organizador Bolsa Bebê", emoji: "🍼", color: "oklch(0.93 0.05 200)", format: "FEED", price: "R$ 19,90", original: "R$ 39,90", discount: 50, when: "Hoje 08:11" },
  { id: "s4", title: "Meia-Calça Térmica Fleece Feminina Peluciada", emoji: "🧦", color: "oklch(0.88 0.06 260)", format: "STORY", price: "R$ 22,90", original: "R$ 59,90", discount: 61, when: "Ontem 21:33" },
  { id: "s5", title: "Kit Elástico de Treino Faixa Resistência 5 Níveis", emoji: "🏋️", color: "oklch(0.88 0.09 150)", format: "FEED", price: "R$ 39,90", original: "R$ 89,00", discount: 55, when: "Ontem 19:12" },
  { id: "s6", title: "Relógio Masculino Digital Militar À Prova d'Água", emoji: "⌚", color: "oklch(0.85 0.05 60)", format: "FEED", price: "R$ 54,90", original: "R$ 149,90", discount: 63, when: "Ontem 16:04" },
  { id: "s7", title: "Touca de Cetim Antifrizz para Dormir Cachos e Alisados", emoji: "🎀", color: "oklch(0.9 0.08 340)", format: "STORY", price: "R$ 9,90", original: "R$ 24,90", discount: 60, when: "Ontem 13:47" },
  { id: "s8", title: "Kit 6 Frascos de Viagem Silicone Squeeze Multiuso", emoji: "🧴", color: "oklch(0.92 0.07 180)", format: "FEED", price: "R$ 17,90", original: "R$ 39,90", discount: 55, when: "Ontem 11:20" },
  { id: "s9", title: "Fones de Ouvido OWS-15 Bluetooth Condução Auricular", emoji: "🎧", color: "oklch(0.85 0.05 240)", format: "STORY", price: "R$ 64,90", original: "R$ 169,90", discount: 62, when: "2 dias atrás" },
  { id: "s10", title: "Abajur Touch LED Recarregável 3 Tons Mesa Cabeceira", emoji: "💡", color: "oklch(0.92 0.08 80)", format: "FEED", price: "R$ 29,90", original: "R$ 79,90", discount: 63, when: "2 dias atrás" },
  { id: "s11", title: "Óleo SOS Cachos Reparador Salon Line Todecacho 60ml", emoji: "🧪", color: "oklch(0.9 0.09 25)", format: "STORY", price: "R$ 13,90", original: "R$ 32,90", discount: 58, when: "3 dias atrás" },
  { id: "s12", title: "Kit 100 Elásticos de Cabelo Invisibobble Sortidos", emoji: "🎀", color: "oklch(0.9 0.06 320)", format: "FEED", price: "R$ 7,90", original: "R$ 19,90", discount: 60, when: "3 dias atrás" },
];

function ShopeePanel() {
  const [tags, setTags] = useState<ShopeeTag[]>(SHOPEE_TAGS);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [importedProducts, setImportedProducts] = useState<ShopeeProduct[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkAction, setBulkAction] = useState<string>("");
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [staticHidden, setStaticHidden] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importBatchFn = useServerFn(importShopeeBatch);
  const listPendingFn = useServerFn(listPendingShopeeImages);
  const enrichOneFn = useServerFn(enrichShopeeImageOne);
  const deleteByItemsFn = useServerFn(deleteProductsByItemIds);
  const deleteAllFn = useServerFn(deleteAllProducts);

  const products = [
    ...importedProducts,
    ...(staticHidden ? [] : SHOPEE_PRODUCTS),
  ].filter((p) => !deletedIds.has(p.id));
  const allChecked = products.length > 0 && products.every((p) => selected[p.id]);

  // Extract Shopee item_id from a preview product id like `csv-<itemId>-<idx>`
  const extractItemId = (previewId: string): string | null => {
    const m = /^csv-(.+)-\d+$/.exec(previewId);
    return m ? m[1] : null;
  };

  const handleExecute = async () => {
    if (bulkBusy) return;
    if (bulkAction !== "Excluir") {
      toast.error("Selecione uma ação para executar.");
      return;
    }
    const selectedIds = products.map((p) => p.id).filter((id) => selected[id]);
    const isAll = products.length > 0 && selectedIds.length === products.length;

    if (isAll) {
      if (!window.confirm("Tem certeza que deseja excluir todos os produtos?")) return;
      setBulkBusy(true);
      try {
        await deleteAllFn({ data: { platform: "shopee" } });
        setImportedProducts([]);
        setStaticHidden(true);
        setDeletedIds(new Set());
        setSelected({});
        setBulkAction("");
        toast.success("Produtos excluídos com sucesso.");
      } catch (err) {
        console.error(err);
        toast.error("Não foi possível excluir os produtos.", {
          description: err instanceof Error ? err.message : undefined,
        });
      } finally {
        setBulkBusy(false);
      }
      return;
    }

    if (selectedIds.length === 0) {
      toast.error("Selecione ao menos um produto.");
      return;
    }

    const itemIds = Array.from(
      new Set(selectedIds.map(extractItemId).filter((v): v is string => !!v)),
    );

    setBulkBusy(true);
    try {
      if (itemIds.length > 0) {
        await deleteByItemsFn({ data: { platform: "shopee", itemIds } });
      }
      setDeletedIds((prev) => {
        const next = new Set(prev);
        for (const id of selectedIds) next.add(id);
        return next;
      });
      setSelected({});
      setBulkAction("");
      toast.success("Produtos excluídos com sucesso.");
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível excluir os produtos.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBulkBusy(false);
    }
  };


  const removeTag = (id: string) => setTags((t) => t.filter((x) => x.id !== id));

  const handlePickCsv = () => fileInputRef.current?.click();

  const rowToPreview = (row: ShopeeCsvRow, index: number): ShopeeProduct => {
    const priceLabel =
      row.price != null
        ? `R$ ${row.price.toFixed(2).replace(".", ",")}`
        : "—";
    return {
      id: `csv-${row.itemId}-${index}`,
      title: row.itemName,
      emoji: "🛍️",
      color: "oklch(0.92 0.06 30)",
      format: index % 2 === 0 ? "FEED" : "STORY",
      price: priceLabel,
      original: priceLabel,
      discount: Math.round(row.commissionRate ?? 0),
      when: "Importado agora",
      affiliateLink: row.offerUrl,
      rawLink: row.productUrl,
      imageUrl: row.imageUrl ?? undefined,
    };
  };

  const enrichImagesInBackground = async () => {
    try {
      const pending = await listPendingFn();
      if (!pending || pending.length === 0) return;
      const total = pending.length;
      let done = 0;
      let found = 0;
      const toastId = toast.loading("Buscando imagens dos produtos...", {
        description: `0 / ${total}`,
      });
      const CONC = 5;
      let cursor = 0;
      const worker = async (): Promise<void> => {
        while (cursor < pending.length) {
          const idx = cursor++;
          const item = pending[idx]!;
          try {
            const res = await enrichOneFn({ data: item });
            if (res.found) found += 1;
          } catch {
            /* ignore individual failures */
          }
          done += 1;
          toast.loading("Buscando imagens dos produtos...", {
            id: toastId,
            description: `Imagens encontradas: ${found} / ${done} (de ${total})`,
          });
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONC, total) }, () => worker()));
      toast.success("Busca de imagens concluída", {
        id: toastId,
        description: `Imagens encontradas: ${found} / ${total}`,
      });
    } catch (err) {
      console.error("Enrichment failed", err);
    }
  };

  const handleCsvFile = async (file: File | null | undefined) => {
    if (!file) return;
    setImporting(true);
    setProgress(null);
    try {
      const text = await file.text();
      const parsed = parseShopeeCsv(text);
      if (!parsed.ok) {
        toast.error(parsed.error);
        return;
      }
      const rows = parsed.rows;
      if (rows.length === 0) {
        toast.error("Nenhum produto reconhecido na planilha.");
        return;
      }

      const BATCH = 200;
      let inserted = 0;
      let updated = 0;
      setProgress({ done: 0, total: rows.length });

      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const outcome = await importBatchFn({ data: { rows: chunk } });
        inserted += outcome.inserted;
        updated += outcome.updated;
        setProgress({ done: Math.min(i + chunk.length, rows.length), total: rows.length });
      }

      setImportedProducts((prev) => [
        ...rows.slice(0, 60).map((r, i) => rowToPreview(r, i)),
        ...prev,
      ]);

      toast.success(`${rows.length} produtos processados`, {
        description: `${inserted} novos · ${updated} atualizados`,
      });

      // Background image enrichment (best-effort, never blocks import).
      void enrichImagesInBackground();
    } catch (err) {
      console.error(err);
      toast.error("Falha ao importar CSV", {
        description: err instanceof Error ? err.message : "Erro desconhecido.",
      });
    } finally {
      setImporting(false);
      setProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };


  return (
    <div className="mt-6 space-y-6">
      {/* Shopee banner */}
      <div className="flex items-center gap-3 rounded-2xl border border-[oklch(0.88_0.14_40)] bg-gradient-to-r from-[oklch(0.7_0.22_35)] to-[oklch(0.62_0.24_25)] p-4 text-white shadow-sm">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
          <ShoppingBag className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-[15px] font-semibold">Shopee — Produtos & Configurações</h3>
          <p className="text-[12.5px] text-white/85">799 produtos vinculados · gerencie categorias, textos padrão e importe em massa.</p>
        </div>
      </div>

      {/* Three columns */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Col 1 - Add Shopee Products */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[oklch(0.95_0.06_35)] text-[oklch(0.6_0.22_30)]">
              <Plus className="h-4 w-4" />
            </div>
            <h3 className="text-[14px] font-semibold">Add Produtos Shopee</h3>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
            Escolha uma <b>categoria</b> e refine com <b>palavras-chave</b> para importar as melhores ofertas do dia.
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Categoria</label>
              <div className="relative">
                <select className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 pr-9 text-sm">
                  {SHOPEE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Palavras-chave</label>
              <Input placeholder="ex: fone bluetooth, kit maternidade..." className="h-10" />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Link Shopee Video</label>
              <Input placeholder="https://s.shopee.com.br/..." className="h-10" />
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-[oklch(0.88_0.1_240)] bg-[oklch(0.97_0.03_240)] p-2.5">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[oklch(0.55_0.19_256)]" />
                <p className="text-[11px] leading-relaxed text-foreground">
                  Substitui o link original do produto. Funciona <b>apenas no celular</b>. Exemplo: <code className="rounded bg-muted px-1 text-[10.5px]">https://s.shopee.com.br/9UvKl8XyzA</code>
                </p>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ordenar busca por</label>
              <div className="relative">
                <select className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 pr-9 text-sm">
                  <option>Mais Vendidos (padrão)</option>
                  <option>Menor Preço</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <Button className="w-full gap-2 rounded-full bg-primary hover:bg-primary/90">
              <Save className="h-4 w-4" /> Salvar
            </Button>
          </div>
        </div>

        {/* Col 2 - Default Text */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[oklch(0.95_0.04_60)] text-[oklch(0.6_0.18_50)]">
              <Edit3 className="h-4 w-4" />
            </div>
            <h3 className="text-[14px] font-semibold">Texto Padrão — Shopee</h3>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
            Configure um <b>cabeçalho</b> e um <b>rodapé</b> específicos que substituirão o texto padrão nos produtos da Shopee.
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cabeçalho do Shopee</label>
              <textarea
                rows={4}
                placeholder="🛍️ ACHADINHO SHOPEE 🛍️"
                className="min-h-[100px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <p className="mt-1 text-[10.5px] text-muted-foreground">Substitui o cabeçalho geral apenas para produtos Shopee.</p>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Rodapé do Shopee</label>
              <textarea
                rows={4}
                placeholder="Frete grátis + Cashback 💰"
                className="min-h-[100px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <p className="mt-1 text-[10.5px] text-muted-foreground">Substitui o rodapé geral apenas para produtos Shopee.</p>
            </div>
            <Button className="w-full gap-2 rounded-full bg-primary hover:bg-primary/90">
              <Save className="h-4 w-4" /> Salvar
            </Button>
          </div>
        </div>

        {/* Col 3 - Bulk Import */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[oklch(0.95_0.06_150)] text-[oklch(0.55_0.19_150)]">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <h3 className="text-[14px] font-semibold">Importar Produtos em Massa</h3>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
            Envie um arquivo <b>.CSV</b> exportado da Shopee Affiliate com as colunas obrigatórias para importar centenas de produtos de uma vez.
          </p>

          <div className="mt-4 space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => handleCsvFile(e.target.files?.[0])}
            />
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Arquivo de Produtos .CSV</label>
              <div
                onClick={handlePickCsv}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleCsvFile(e.dataTransfer.files?.[0]);
                }}
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/70 bg-muted/20 px-4 py-6 text-center transition hover:border-primary/60 hover:bg-muted/40"
              >
                <Upload className="h-6 w-6 text-muted-foreground" />
                <p className="text-[12.5px] font-medium text-foreground">Arraste seu arquivo aqui</p>
                <p className="text-[11px] text-muted-foreground">ou clique para selecionar</p>
                <Button type="button" variant="outline" size="sm" className="mt-1 h-8 rounded-full text-[12px]" onClick={(e) => { e.stopPropagation(); handlePickCsv(); }}>
                  Escolher .CSV
                </Button>
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Colunas obrigatórias</p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-foreground">
                <code className="rounded bg-background px-1">Item Id</code>{" · "}
                <code className="rounded bg-background px-1">Item Name</code>{" · "}
                <code className="rounded bg-background px-1">Price</code>{" · "}
                <code className="rounded bg-background px-1">Sales</code>{" · "}
                <code className="rounded bg-background px-1">Shop Name</code>{" · "}
                <code className="rounded bg-background px-1">Commission Rate</code>{" · "}
                <code className="rounded bg-background px-1">Commission</code>{" · "}
                <code className="rounded bg-background px-1">Product Link</code>{" · "}
                <code className="rounded bg-background px-1">Offer Link</code>
              </p>
            </div>
            <Button
              type="button"
              disabled={importing}
              onClick={handlePickCsv}
              className="w-full gap-2 rounded-full bg-primary hover:bg-primary/90"
            >
              <Upload className="h-4 w-4" />
              {importing
                ? progress
                  ? `Importando ${progress.done} / ${progress.total}...`
                  : "Importando..."
                : "Importar"}
            </Button>
          </div>

        </div>
      </div>

      {/* Tags & Search */}
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-[14px] font-semibold">Categorias / Palavras-chave salvas</h3>
            <p className="text-[11.5px] text-muted-foreground">Cada tag representa uma busca automática recorrente da Shopee.</p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-full border-[oklch(0.85_0.12_25)] text-[oklch(0.55_0.22_25)] hover:bg-[oklch(0.97_0.04_25)]">
            <Trash2 className="h-3.5 w-3.5" /> Excluir Tudo
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {tags.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">Nenhuma categoria salva ainda.</p>
          ) : (
            tags.map((t) => (
              <span
                key={t.id}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium",
                  t.type === "cat"
                    ? "border-[oklch(0.88_0.1_35)] bg-[oklch(0.97_0.04_35)] text-[oklch(0.55_0.22_30)]"
                    : "border-border/60 bg-muted/40 text-foreground",
                )}
              >
                {t.type === "cat" ? <Tag className="h-3 w-3" /> : <Search className="h-3 w-3" />}
                {t.label}
                <button onClick={() => removeTag(t.id)} className="ml-0.5 grid h-4 w-4 place-items-center rounded-full hover:bg-black/10">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Pesquisar produtos cadastrados..." className="h-10 pl-9" />
          </div>
          <Button className="h-10 gap-2 rounded-md bg-primary px-5 hover:bg-primary/90">
            <Search className="h-4 w-4" /> Pesquisar
          </Button>
        </div>
      </div>

      {/* Product list */}
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <div className="border-b border-border/60 bg-muted/20 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-[15px] font-semibold">Produtos cadastrados</h3>
              <p className="text-[12px] text-muted-foreground">799 produtos vinculados a este canal</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full">
                <RefreshCw className="h-3.5 w-3.5" /> Atualizar
              </Button>
              <Button size="sm" className="h-9 gap-1.5 rounded-full bg-primary hover:bg-primary/90">
                <Plus className="h-3.5 w-3.5" /> Novo produto
              </Button>
            </div>
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-lg border border-[oklch(0.88_0.1_60)] bg-[oklch(0.98_0.04_60)] p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.6_0.19_50)]" />
            <p className="text-[12px] leading-relaxed text-foreground">
              Enviar <b>muitas postagens ao mesmo tempo</b> para o WhatsApp pode causar <b>bloqueio por SPAM</b>. Use com cautela!
            </p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative">
              <select className="h-9 appearance-none rounded-md border border-input bg-background px-3 pr-8 text-[12.5px]">
                <option>12 por página</option>
                <option>24 por página</option>
                <option>48 por página</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
            <div className="relative">
              <select className="h-9 appearance-none rounded-md border border-input bg-background px-3 pr-8 text-[12.5px]">
                <option>Mais novos</option>
                <option>Mais antigos</option>
                <option>Maior desconto</option>
                <option>Menor preço</option>
                <option>Mais vendidos</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
            <div className="relative">
              <select className="h-9 appearance-none rounded-md border border-input bg-background px-3 pr-8 text-[12.5px]">
                <option>Todos os envios</option>
                <option>Enviados</option>
                <option>Não enviados</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
            <div className="ml-auto flex items-center gap-2 rounded-lg border border-border/60 bg-background px-2.5 py-1.5">
              <label className="flex items-center gap-1.5 text-[12px]">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => {
                    const v = e.target.checked;
                    const next: Record<string, boolean> = {};
                    products.forEach((p) => (next[p.id] = v));
                    setSelected(next);
                  }}
                  className="h-3.5 w-3.5 accent-[oklch(0.62_0.19_256)]"
                />
                Todos
              </label>
              <div className="relative">
                <select
                  className="h-8 appearance-none rounded-md border border-input bg-background px-2.5 pr-7 text-[12px]"
                  value={bulkAction}
                  onChange={(e) => setBulkAction(e.target.value)}
                >
                  <option value="">Selecione uma ação...</option>
                  <option value="Enviar Feed WhatsApp">Enviar Feed WhatsApp</option>
                  <option value="Enviar Story Instagram">Enviar Story Instagram</option>
                  <option value="Republicar">Republicar</option>
                  <option value="Excluir">Excluir</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
              <Button
                size="sm"
                onClick={handleExecute}
                disabled={bulkBusy}
                className="h-8 gap-1.5 rounded-md bg-[oklch(0.62_0.19_150)] px-3 text-[12px] hover:bg-[oklch(0.55_0.19_150)]"
              >
                <Play className="h-3 w-3" /> {bulkBusy ? "Executando..." : "Executar"}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 p-5 md:grid-cols-3 xl:grid-cols-4">
          {products.map((p) => (
            <div key={p.id} className="group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-sm transition hover:shadow-md">
              <div className="relative aspect-square w-full overflow-hidden" style={{ background: p.color }}>
                <input
                  type="checkbox"
                  checked={!!selected[p.id]}
                  onChange={(e) => setSelected((s) => ({ ...s, [p.id]: e.target.checked }))}
                  className="absolute left-2.5 top-2.5 z-10 h-4 w-4 accent-[oklch(0.62_0.19_256)]"
                />
                <span className={cn(
                  "absolute right-2.5 top-2.5 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm",
                  p.format === "STORY"
                    ? "bg-gradient-to-r from-[oklch(0.6_0.22_20)] to-[oklch(0.55_0.22_320)]"
                    : "bg-gradient-to-r from-[oklch(0.62_0.19_256)] to-[oklch(0.55_0.2_230)]",
                )}>
                  {p.format}
                </span>
                {p.discount > 0 ? (
                  <span className="absolute bottom-2.5 right-2.5 rounded-md bg-[oklch(0.62_0.24_25)] px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                    -{p.discount}%
                  </span>
                ) : null}
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-6xl">{p.emoji}</div>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-2 p-3">
                <p className="line-clamp-2 min-h-[34px] text-[12.5px] font-medium leading-snug text-foreground">
                  {p.title}
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-[15px] font-bold text-[oklch(0.55_0.22_25)]">{p.price}</span>
                  <span className="text-[11px] text-muted-foreground line-through">{p.original}</span>
                </div>
                <div className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
                  <Calendar className="h-3 w-3" /> {p.when}
                </div>

                {p.affiliateLink ? (
                  <div className="flex items-center gap-1.5 rounded-md border border-[oklch(0.9_0.08_150)] bg-[oklch(0.97_0.04_150)] px-2 py-1.5">
                    <Tag className="h-3 w-3 shrink-0 text-[oklch(0.5_0.19_150)]" />
                    <a
                      href={p.affiliateLink}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 truncate text-[10.5px] font-medium text-[oklch(0.4_0.15_150)] hover:underline"
                      title={p.affiliateLink}
                    >
                      {p.affiliateLink}
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(p.affiliateLink!);
                        toast.success("Link comissionado copiado!");
                      }}
                      className="text-[oklch(0.5_0.19_150)] hover:text-[oklch(0.4_0.19_150)]"
                      title="Copiar link"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                ) : null}

                <div className="mt-1 grid grid-cols-3 gap-1.5">
                  <Button size="sm" className="h-8 gap-1 rounded-md bg-[oklch(0.62_0.19_150)] px-1.5 text-[11px] hover:bg-[oklch(0.55_0.19_150)]">
                    <MessageCircle className="h-3 w-3" /> Grupos
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 gap-1 rounded-md px-1.5 text-[11px]">
                    <Edit3 className="h-3 w-3" /> Editar
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 gap-1 rounded-md px-1.5 text-[11px]">
                    <MoreHorizontal className="h-3 w-3" /> Mais
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>


        {/* Pagination */}
        <div className="flex flex-col items-center justify-between gap-3 border-t border-border/60 bg-muted/20 px-5 py-3 sm:flex-row">
          <p className="text-[12px] text-muted-foreground">Mostrando 1 – 12 de 799 produtos</p>
          <div className="flex flex-wrap items-center gap-1">
            <Button size="sm" variant="outline" className="h-8 rounded-md">Anterior</Button>
            {[1, 2, 3, 4, 5].map((n) => (
              <Button
                key={n}
                size="sm"
                className={cn(
                  "h-8 min-w-[32px] rounded-md px-2",
                  n === 1 ? "bg-primary text-primary-foreground" : "bg-background text-foreground border border-input hover:bg-muted",
                )}
              >
                {n}
              </Button>
            ))}
            <span className="px-1 text-muted-foreground">…</span>
            <Button size="sm" variant="outline" className="h-8 min-w-[32px] rounded-md px-2">67</Button>
            <Button size="sm" variant="outline" className="h-8 rounded-md">Próximo</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
