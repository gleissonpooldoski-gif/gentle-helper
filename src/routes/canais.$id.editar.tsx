import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { parseShopeeCsv, type ShopeeCsvRow } from "@/modules/products/shopee-import/csv.processor";
import { importShopeeBatch } from "@/modules/products/shopee-import/shopee-import.controller.functions";
import { deleteProductsByItemIds, deleteAllProducts } from "@/modules/products/shopee-import/product-delete.functions";
import { listPendingShopeeImages, enrichShopeeImagesBatch } from "@/modules/products/shopee-import/image-enrich.functions";
import { addMLProductByLink, searchMLProducts, addMLProductsByIds } from "@/modules/products/mercadolivre/controller.functions";
import {
  getWhatsAppConnection,
  generateWhatsAppToken,
  reconnectWhatsApp,
  type WhatsAppConnectionDTO,
} from "@/modules/channels/whatsapp/connection.functions";
import {
  getWhatsAppSession,
  disconnectWhatsAppSession,
  type WhatsAppSessionDTO,
} from "@/modules/channels/whatsapp/session.functions";
import {
  listWhatsAppSessions,
  createWhatsAppSession,
  confirmWhatsAppSession,
  getChannelWhatsAppSession,
  linkChannelToSession,
  unlinkChannelSession,
  type WASessionDTO,
} from "@/modules/channels/whatsapp/sessions.functions";
import { WhatsAppInstancePanel } from "@/components/whatsapp/WhatsAppInstancePanel";
import { SiteConfigPanel } from "@/components/site/SiteConfigPanel";
import { SendToGroupsModal, type SendProduct } from "@/components/whatsapp/SendToGroupsModal";
import {
  getPostLayout,
  savePostLayout,
  listHeaderVariations,
  addHeaderVariation,
  deleteHeaderVariation,
  sendLayoutTestMessage,
  type HeaderVariation,
} from "@/modules/posts/layout.functions";
import { DEFAULT_POST_LAYOUT, type PostLayout } from "@/modules/posts/render";
import { GroupAutomationList } from "@/components/automation/GroupAutomationList";
import { getChannel, updateChannel, getChannelProductCounts, type ChannelDTO, type ChannelProductCountsDTO } from "@/modules/channels/channels.functions";
import { getChannelFlowSummary, listAutomationGroups, type ChannelFlowSummaryDTO, type AutomationGroupDTO } from "@/modules/automation/automation.functions";
import { getManualPost, saveManualPost, type ManualPostDTO } from "@/modules/posts/manual-post.functions";
import { ensureAffiliateLink, buildMLAffiliateUrl } from "@/lib/affiliate-linker";
import { EditProductModal, type EditProductTarget } from "@/components/products/EditProductModal";
import { listChannelProducts, type ChannelProductDTO } from "@/modules/products/channel-products.functions";
import { listMonitorGroups, saveMonitorGroups, type MonitorGroupDTO } from "@/modules/monitor/monitor.functions";
import {
  getInstagramConnection, startInstagramOAuth, disconnectInstagram, updateInstagramFlags,
  listInstagramKeywords, saveInstagramKeyword, getInstagramTemplate, saveInstagramTemplate,
  getInstagramSchedule, saveInstagramSchedule, type IgConnectionView,
} from "@/lib/instagram.functions";
import { InstaBotHelpPanel } from "@/components/instabot/InstaBotHelpPanel";



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
  { id: "ml", label: "Mercado Livre" },
  { id: "shopee", label: "Shopee" },
];

const STORES = [
  "Amazon",
  "Shopee",
  "Mercado Livre",
];

function EditChannelPage() {
  const { id } = Route.useParams();
  const getChannelFn = useServerFn(getChannel);
  const updateChannelFn = useServerFn(updateChannel);
  const getFlowSummaryFn = useServerFn(getChannelFlowSummary);
  const listAutomationGroupsFn = useServerFn(listAutomationGroups);
  const getManualPostFn = useServerFn(getManualPost);
  const saveManualPostFn = useServerFn(saveManualPost);
  const buildMLAffiliateUrlFn = useServerFn(buildMLAffiliateUrl);
  const getProductCountsFn = useServerFn(getChannelProductCounts);
  const [channel, setChannel] = useState<ChannelDTO | null>(null);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [flowSummary, setFlowSummary] = useState<ChannelFlowSummaryDTO | null>(null);
  const [flowGroups, setFlowGroups] = useState<AutomationGroupDTO[]>([]);
  const [productCounts, setProductCounts] = useState<ChannelProductCountsDTO>({ shopee: 0, mercadolivre: 0 });
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

  // -------- Post manual: rascunho persistido por canal --------
  const [manualPost, setManualPost] = useState<ManualPostDTO | null>(null);
  const [manualSaving, setManualSaving] = useState(false);
  const patchManual = useCallback(<K extends keyof ManualPostDTO>(k: K, v: ManualPostDTO[K]) => {
    setManualPost((prev) => (prev ? { ...prev, [k]: v } : prev));
  }, []);
  // Sincroniza dois checkboxes que já existiam com o rascunho.
  useEffect(() => {
    if (!manualPost) return;
    setKeepLink(manualPost.keepLink);
    setNeverExpires(manualPost.neverExpires);
  }, [manualPost?.id]);

  const refreshFlowSummary = useCallback(() => {
    void getFlowSummaryFn({ data: { channelId: id } })
      .then(setFlowSummary)
      .catch(() => {
        /* mantém último snapshot */
      });
    void listAutomationGroupsFn({ data: { channelId: id } })
      .then(setFlowGroups)
      .catch(() => {
        /* mantém último snapshot */
      });
  }, [getFlowSummaryFn, listAutomationGroupsFn, id]);

  const refreshProductCounts = useCallback(() => {
    void getProductCountsFn({ data: { channelId: id } })
      .then(setProductCounts)
      .catch(() => {
        /* mantém último snapshot */
      });
  }, [getProductCountsFn, id]);

  useEffect(() => {
    refreshProductCounts();
  }, [refreshProductCounts, tab]);

  useEffect(() => {
    const onFocus = () => refreshProductCounts();
    window.addEventListener("focus", onFocus);
    const t = window.setInterval(refreshProductCounts, 30_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(t);
    };
  }, [refreshProductCounts]);

  useEffect(() => {
    console.info("Editando canal:", id);
    let cancelled = false;
    setChannel(null);
    setChannelError(null);
    setFlowSummary(null);
    setManualPost(null);
    void getChannelFn({ data: { channelId: id } })
      .then((next) => {
        if (!cancelled) {
          setChannel(next);
          setAutoPost(next.autoPost);
        }
      })
      .catch((error) => {
        if (!cancelled) setChannelError(error instanceof Error ? error.message : "Falha ao carregar canal");
      });
    void getManualPostFn({ data: { channelId: id } })
      .then((mp) => {
        if (!cancelled) setManualPost(mp);
      })
      .catch(() => {
        /* rascunho inexistente — mantém formulário utilizável */
      });
    refreshFlowSummary();
    // Refresh periódico leve — captura validações do worker e novas importações.
    const t = setInterval(refreshFlowSummary, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [id, getChannelFn, getManualPostFn, refreshFlowSummary]);

  const handleUpdateChannel = async () => {
    try {
      const nextChannel = await updateChannelFn({ data: { channelId: id, autoPost } });
      setChannel(nextChannel);
      let scheduledNow = false;
      if (manualPost) {
        setManualSaving(true);
        try {
          const saved = await saveManualPostFn({
            data: {
              channelId: id,
              productLink: manualPost.productLink,
              keepLink,
              headerMode: manualPost.headerMode,
              customHeader: manualPost.customHeader,
              shopeeVideoLink: manualPost.shopeeVideoLink,
              priceOriginal: manualPost.priceOriginal,
              priceCurrent: manualPost.priceCurrent,
              priceSuffix: manualPost.priceSuffix,
              priceInstallment: manualPost.priceInstallment,
              description: manualPost.description,
              neverExpires,
              scheduledDate: manualPost.scheduledDate,
              scheduledTime: manualPost.scheduledTime,
              couponType: manualPost.couponType,
              couponValue: manualPost.couponValue,
              couponMinValue: manualPost.couponMinValue,
              couponCode: manualPost.couponCode,
            },
          });
          setManualPost(saved);
          scheduledNow = saved.status === "scheduled";
        } finally {
          setManualSaving(false);
        }
      }
      toast.success(scheduledNow ? "Canal atualizado. Post agendado." : "Canal atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar canal");
    }
  };

  const handleSaveManualPost = async () => {
    if (!manualPost) return;
    if (!neverExpires && (!manualPost.scheduledDate || !manualPost.scheduledTime)) {
      toast.error("Informe data e horário do agendamento ou marque NÃO EXPIRA.");
      return;
    }
    setManualSaving(true);
    try {
      let finalLink = manualPost.productLink?.trim() ?? "";
      if (finalLink) {
        const result = await ensureAffiliateLink(finalLink, (input) =>
          buildMLAffiliateUrlFn({ data: input }),
        );
        if (result.missing) {
          toast.error(result.missing);
          setManualSaving(false);
          return;
        }
        finalLink = result.url;
        if (result.tagged) {
          setManualPost((prev) => (prev ? { ...prev, productLink: finalLink } : prev));
          toast.info("Link de afiliado aplicado automaticamente.");
        }
      }
      const saved = await saveManualPostFn({
        data: {
          channelId: id,
          productLink: finalLink,
          keepLink,
          headerMode: manualPost.headerMode,
          customHeader: manualPost.customHeader,
          shopeeVideoLink: manualPost.shopeeVideoLink,
          priceOriginal: manualPost.priceOriginal,
          priceCurrent: manualPost.priceCurrent,
          priceSuffix: manualPost.priceSuffix,
          priceInstallment: manualPost.priceInstallment,
          description: manualPost.description,
          neverExpires,
          scheduledDate: manualPost.scheduledDate,
          scheduledTime: manualPost.scheduledTime,
          couponType: manualPost.couponType,
          couponValue: manualPost.couponValue,
          couponMinValue: manualPost.couponMinValue,
          couponCode: manualPost.couponCode,
        },
      });
      setManualPost(saved);
      toast.success(saved.status === "scheduled" ? "Post salvo e agendado." : "Post salvo com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar post.");
    } finally {
      setManualSaving(false);
    }
  };

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
                   Editar canal · ID {channel?.externalId ?? id}
                </p>
                <h1 className="truncate font-display text-2xl font-bold tracking-tight text-foreground">
                   {channelError ?? channel?.name ?? "Carregando canal…"}
                </h1>
              </div>
            </div>

            <Button
              size="lg"
              className="rounded-full bg-primary px-6 shadow-[0_10px_30px_-12px_oklch(0.62_0.19_256/0.6)] hover:bg-primary/90"
              onClick={handleUpdateChannel}
              disabled={!channel || manualSaving}
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
                const count =
                  t.id === "shopee" ? productCounts.shopee : t.id === "ml" ? productCounts.mercadolivre : undefined;
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
                    {typeof count === "number" && (
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                          active ? "bg-white/20" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {tab === "layout" ? (
            <LayoutPostPanel channelId={id} />
          ) : tab === "site" ? (
            <SiteConfigPanel channelId={id} />
          ) : tab === "instagram" ? (
            <InstagramPanel channelId={id} />
          ) : tab === "instasched" ? (
            <InstaSchedPanel />
          ) : tab === "instabot" ? (
            <InstaBotHelpPanel channelId={id} />
          ) : tab === "wa-grupos" ? (
            <WhatsAppGroupsPanel />
          ) : tab === "wa-monitor" ? (
            <WhatsAppMonitorPanel channelId={id} />
          ) : tab === "ml" ? (
            <MercadoLivrePanel onCountsChanged={refreshProductCounts} />
          ) : tab === "shopee" ? (
            <ShopeePanel onCountsChanged={refreshProductCounts} />
          ) : (





          /* Content grid */
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">

            {/* LEFT column */}
            <div className="space-y-6">
              {/* Product link + metadata */}
              <SectionCard title="Link do produto" icon={<Info className="h-4 w-4" />}>
                <Field label="Link do Produto">
                  <Input
                    placeholder="https://..."
                    className="h-10"
                    value={manualPost?.productLink ?? ""}
                    onChange={(e) => patchManual("productLink", e.target.value)}
                  />
                </Field>

                <Alert tone="warning">
                  <strong>ATENÇÃO!</strong> produtos adicionados via link{" "}
                  <strong>NÃO</strong> são atualizados automaticamente.
                </Alert>

                <Checkbox
                  checked={keepLink}
                  onChange={(v) => {
                    setKeepLink(v);
                    patchManual("keepLink", v);
                  }}
                  label="Manter esse link no post."
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Cabeçalho Dinâmico">
                    <button
                      type="button"
                      onClick={() =>
                        patchManual(
                          "headerMode",
                          manualPost?.headerMode === "custom" ? "default" : "custom",
                        )
                      }
                      className="flex h-10 w-full items-center justify-between rounded-lg border border-border bg-background px-3 text-sm text-foreground hover:border-primary/40"
                    >
                      <span>
                        {manualPost?.headerMode === "custom" ? "Cabeçalho personalizado" : "Padrão do canal"}
                      </span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </Field>
                  <Field label="Ou digite um novo cabeçalho">
                    <Input
                      placeholder="Novo cabeçalho..."
                      className="h-10"
                      value={manualPost?.customHeader ?? ""}
                      onChange={(e) => {
                        patchManual("customHeader", e.target.value);
                        if (e.target.value) patchManual("headerMode", "custom");
                        else patchManual("headerMode", "default");
                      }}
                    />
                  </Field>
                </div>

                <Field label="Link Shopee Video">
                  <Input
                    placeholder="Ex: https://br.shp.ee/ejolle5..."
                    className="h-10"
                    value={manualPost?.shopeeVideoLink ?? ""}
                    onChange={(e) => patchManual("shopeeVideoLink", e.target.value)}
                  />
                </Field>
                <Alert tone="info">
                  Substitui o link original em dispositivos móveis para abrir
                  direto no app da Shopee com o vídeo do produto.
                </Alert>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Preço original">
                    <Input
                      placeholder="R$ 0,00"
                      className="h-10"
                      value={manualPost?.priceOriginal ?? ""}
                      onChange={(e) => patchManual("priceOriginal", e.target.value)}
                    />
                  </Field>
                  <Field label="Preço atual">
                    <Input
                      placeholder="R$ 0,00"
                      className="h-10"
                      value={manualPost?.priceCurrent ?? ""}
                      onChange={(e) => patchManual("priceCurrent", e.target.value)}
                    />
                  </Field>
                  <Field label="Sufixo do preço">
                    <Input
                      placeholder="ex: no Pix"
                      className="h-10"
                      value={manualPost?.priceSuffix ?? ""}
                      onChange={(e) => patchManual("priceSuffix", e.target.value)}
                    />
                  </Field>
                  <Field label="Preço parcelado">
                    <Input
                      placeholder="10x de R$ 0,99"
                      className="h-10"
                      value={manualPost?.priceInstallment ?? ""}
                      onChange={(e) => patchManual("priceInstallment", e.target.value)}
                    />
                  </Field>
                </div>

                <Field label="Descrição" hint="Escopo apenas deste post.">
                  <textarea
                    rows={3}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    placeholder="Descreva a oferta..."
                    value={manualPost?.description ?? ""}
                    onChange={(e) => patchManual("description", e.target.value)}
                  />
                </Field>

                <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Agendamento
                  </p>
                  <Checkbox
                    checked={neverExpires}
                    onChange={(v) => {
                      setNeverExpires(v);
                      patchManual("neverExpires", v);
                    }}
                    label="NÃO EXPIRA"
                  />
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="relative">
                      <Input
                        type="date"
                        className="h-10 pr-9"
                        disabled={neverExpires}
                        value={manualPost?.scheduledDate ?? ""}
                        onChange={(e) => patchManual("scheduledDate", e.target.value || null)}
                      />
                      <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                    <Input
                      type="time"
                      className="h-10"
                      disabled={neverExpires}
                      value={manualPost?.scheduledTime ?? ""}
                      onChange={(e) => patchManual("scheduledTime", e.target.value || null)}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    type="button"
                    onClick={handleSaveManualPost}
                    disabled={manualSaving || !manualPost}
                    className="gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {manualSaving ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </SectionCard>

              {/* Cupons */}
              <SectionCard title="Cupons" icon={<Ticket className="h-4 w-4" />}>
                <Field label="Tipo de Cupom">
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { label: "R$ Fixo", value: "fixed" as const },
                        { label: "% Desconto", value: "percent" as const },
                        { label: "Frete Grátis", value: "freight" as const },
                      ]
                    ).map((opt) => {
                      const active = (manualPost?.couponType ?? "percent") === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => patchManual("couponType", opt.value)}
                          className={cn(
                            "rounded-lg border px-3 py-2 text-sm font-medium transition-all",
                            active
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background text-foreground/75 hover:border-primary/40",
                          )}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label="Valor do desconto">
                    <Input
                      placeholder="0"
                      className="h-10"
                      value={manualPost?.couponValue ?? ""}
                      onChange={(e) => patchManual("couponValue", e.target.value)}
                    />
                  </Field>
                  <Field label="Valor mínimo">
                    <Input
                      placeholder="R$ 0,00"
                      className="h-10"
                      value={manualPost?.couponMinValue ?? ""}
                      onChange={(e) => patchManual("couponMinValue", e.target.value)}
                    />
                  </Field>
                  <Field label="Código do cupom">
                    <Input
                      placeholder="PROMO10"
                      className="h-10 font-mono uppercase"
                      value={manualPost?.couponCode ?? ""}
                      onChange={(e) => patchManual("couponCode", e.target.value.toUpperCase())}
                    />
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
                      {flowSummary?.activeProducts ?? "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ideal ~{flowSummary?.idealApprox ?? 300}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">produtos ativos</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/60">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[oklch(0.75_0.16_150)] to-[oklch(0.68_0.17_160)]"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            ((flowSummary?.activeProducts ?? 0) /
                              Math.max(1, flowSummary?.idealApprox ?? 300)) *
                              100,
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                <p className="mt-4 text-[11.5px] leading-relaxed text-foreground/75">
                  Intervalo de <strong>{flowSummary?.intervalMin ?? 15} min</strong> →{" "}
                  <strong>{flowSummary?.postsPerHour ?? 4} posts/hora</strong>.
                  Envio em ordem aleatória com proteção anti-repetição de{" "}
                  <strong>{flowSummary?.antiRepetitionHours ?? 24}h</strong>.
                </p>
              </div>

              {/* Mini cards verticais removidos — a lista horizontal "Automação
                  por grupo" abaixo já mostra as mesmas métricas por (WhatsApp ×
                  Grupo) de forma mais limpa e funcional. */}
            </aside>
          </div>
          )}

          {/* Frequência e Loop — largura total, um card por (WhatsApp × Grupo) */}
          {tab !== "layout" && tab !== "site" && tab !== "instagram" && tab !== "instasched" && tab !== "instabot" && tab !== "wa-grupos" && tab !== "wa-monitor" && tab !== "ml" && tab !== "shopee" && (
            <section className="mt-8">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold text-foreground">
                    Automação por grupo
                  </h2>
                  <p className="text-[12.5px] text-muted-foreground">
                    Cada card representa uma dupla WhatsApp × Grupo, com métricas e ações próprias.
                  </p>
                </div>
              </div>
              <GroupAutomationList channelId={id} />
            </section>
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

function LayoutPostPanel({ channelId }: { channelId: string }) {
  const getLayoutFn = useServerFn(getPostLayout);
  const saveLayoutFn = useServerFn(savePostLayout);
  const listVariationsFn = useServerFn(listHeaderVariations);
  const addVariationFn = useServerFn(addHeaderVariation);
  const deleteVariationFn = useServerFn(deleteHeaderVariation);
  const sendTestFn = useServerFn(sendLayoutTestMessage);

  const [waPreview, setWaPreview] = useState(true);
  const [layout, setLayout] = useState<PostLayout>(DEFAULT_POST_LAYOUT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [variations, setVariations] = useState<HeaderVariation[]>([]);
  const [newVariation, setNewVariation] = useState("");
  const [addingVar, setAddingVar] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const [l, vs] = await Promise.all([
          getLayoutFn({ data: { channelId } }),
          listVariationsFn().catch(() => [] as HeaderVariation[]),
        ]);
        setLayout(l);
        setVariations(vs);
      } catch (err) {
        console.warn("[layout] load failed:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [getLayoutFn, listVariationsFn, channelId]);

  const update = <K extends keyof PostLayout>(k: K, v: PostLayout[K]) =>
    setLayout((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveLayoutFn({ data: { ...layout, channelId } });
      setLayout(saved);
      toast.success("Layout deste canal salvo. Próximos envios do WhatsApp usarão este template.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar layout");
    } finally {
      setSaving(false);
    }
  };

  const handleAddVariation = async () => {
    const text = newVariation.trim();
    if (!text) return;
    setAddingVar(true);
    try {
      const row = await addVariationFn({ data: { text } });
      setVariations((prev) => [...prev, row]);
      setNewVariation("");
      toast.success("Variação adicionada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao adicionar variação");
    } finally {
      setAddingVar(false);
    }
  };

  const handleDeleteVariation = async (id: string) => {
    try {
      await deleteVariationFn({ data: { id } });
      setVariations((prev) => prev.filter((v) => v.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao remover variação");
    }
  };

  const handleSendTest = async () => {
    const phone = testPhone.trim();
    if (!phone) {
      toast.error("Informe seu número (com DDD)");
      return;
    }
    setTesting(true);
    try {
      const res = await sendTestFn({ data: { channelId, phone, layout } });
      toast.success(`Teste enviado no WhatsApp para ${res.jid.split("@")[0]} usando "${res.productTitle}".`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar teste");
    } finally {
      setTesting(false);
    }
  };

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

          <div className="rounded-xl border border-border/70 bg-muted/30 p-3 space-y-3">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cabeçalho Geral
            </label>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={`header-mode-${channelId}`}
                  checked={layout.header_mode === "custom"}
                  onChange={() => update("header_mode", "custom")}
                />
                <span>Usar cabeçalho personalizado</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={`header-mode-${channelId}`}
                  checked={layout.header_mode === "auto"}
                  onChange={() => update("header_mode", "auto")}
                />
                <span>Usar cabeçalho automático</span>
              </label>
            </div>

            {layout.header_mode === "custom" ? (
              <LayoutField
                label="Frase fixa"
                hint="Essa frase será usada em todos os posts"
                value={layout.header}
                onChange={(v) => update("header", v)}
              />
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] italic text-muted-foreground">
                  Uma frase é escolhida aleatoriamente do banco abaixo a cada envio, evitando repetir as últimas usadas.
                </p>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-border/60 bg-background divide-y divide-border/60">
                  {variations.length === 0 && (
                    <div className="px-3 py-2 text-[12px] text-muted-foreground">Nenhuma variação disponível.</div>
                  )}
                  {variations.map((v) => (
                    <div key={v.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[13px]">
                      <span className="truncate">{v.text}</span>
                      {v.user_id ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteVariation(v.id)}
                          className="text-[11px] text-destructive hover:underline"
                        >
                          Remover
                        </button>
                      ) : (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">padrão</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={newVariation}
                    onChange={(e) => setNewVariation(e.target.value)}
                    placeholder="🚨 OFERTA EXCLUSIVA DO GRUPO!"
                    className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-[13px] outline-none focus:border-primary"
                  />
                  <Button
                    type="button"
                    onClick={handleAddVariation}
                    disabled={addingVar || !newVariation.trim()}
                    className="h-10 rounded-lg"
                  >
                    + Adicionar
                  </Button>
                </div>
              </div>
            )}
          </div>


          <LayoutField
            label="Texto do Título"
            hint="Use as tags para formatar. Ex: 🔥🔥 <b>{title}</b> 🔥🔥"
            value={layout.title_template}
            onChange={(v) => update("title_template", v)}
          />

          <div className="grid grid-cols-1 gap-2 rounded-xl border border-border/70 bg-muted/30 p-3 sm:grid-cols-2">
            <Checkbox checked={layout.upper_title} onChange={(v) => update("upper_title", v)} label="TÍTULO EM MAIÚSCULO" small />
            <Checkbox
              checked={layout.hide_sales}
              onChange={(v) => update("hide_sales", v)}
              label="OCULTAR TEXTO DE VENDAS"
              small
            />
          </div>

          <LayoutField
            label="Texto de Vendas"
            value={layout.sales_template}
            onChange={(v) => update("sales_template", v)}
            disabled={layout.hide_sales}
          />

          <LayoutField
            label="Texto da Descrição"
            value={layout.description_template}
            onChange={(v) => update("description_template", v)}
            rows={2}
          />

          <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
            <Checkbox
              checked={layout.hide_original}
              onChange={(v) => update("hide_original", v)}
              label="OCULTAR VALOR ORIGINAL"
              small
            />
          </div>
          <LayoutField
            label="Texto do Preço Original"
            value={layout.original_price_template}
            onChange={(v) => update("original_price_template", v)}
            disabled={layout.hide_original}
          />

          <LayoutField
            label="Texto do Parcelamento"
            value={layout.installment_template}
            onChange={(v) => update("installment_template", v)}
          />
          <LayoutField
            label="Texto do Preço Atual"
            value={layout.price_template}
            onChange={(v) => update("price_template", v)}
          />
          <LayoutField
            label="Texto do Link de Afiliado"
            value={layout.link_template}
            onChange={(v) => update("link_template", v)}
          />

          <LayoutField
            label="Rodapé Geral"
            hint="Exibido ao final de todos os posts"
            value={layout.footer}
            onChange={(v) => update("footer", v)}
            rows={2}
          />

          <div className="mt-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-primary/80">
              Testar no seu WhatsApp
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              Envia uma mensagem real usando o produto mais recente do canal e o layout acima (mesmo sem salvar).
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                type="tel"
                inputMode="numeric"
                placeholder="Seu número com DDD (ex.: 11987654321)"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              />
              <Button
                onClick={handleSendTest}
                disabled={testing || loading}
                variant="outline"
                className="h-10 rounded-lg px-4"
              >
                {testing ? "Enviando…" : "Enviar teste"}
              </Button>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSave}
              disabled={saving || loading}
              className="h-10 rounded-lg bg-primary px-6 hover:bg-primary/90"
            >
              <Save className="mr-1.5 h-4 w-4" />
              {saving ? "Salvando..." : "Salvar layout"}
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
  value,
  onChange,
  rows = 1,
  disabled,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
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
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          disabled={disabled}
          className={cn(
            "w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-[13px] outline-none focus:border-primary",
            disabled && "opacity-50",
          )}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
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

function InstagramPanel({ channelId }: { channelId: string }) {
  const getConnFn = useServerFn(getInstagramConnection);
  const startOAuthFn = useServerFn(startInstagramOAuth);
  const disconnectFn = useServerFn(disconnectInstagram);
  const flagsFn = useServerFn(updateInstagramFlags);
  const listKwFn = useServerFn(listInstagramKeywords);
  const saveKwFn = useServerFn(saveInstagramKeyword);
  const getTplFn = useServerFn(getInstagramTemplate);
  const saveTplFn = useServerFn(saveInstagramTemplate);
  const getSchedFn = useServerFn(getInstagramSchedule);
  const saveSchedFn = useServerFn(saveInstagramSchedule);

  const [connection, setConnection] = useState<IgConnectionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoPost, setAutoPost] = useState(true);
  const [disableReply, setDisableReply] = useState(false);
  const [schedActive, setSchedActive] = useState(true);
  const [days, setDays] = useState<string[]>(["seg", "ter", "qua", "qui", "sex"]);
  const [hours, setHours] = useState<number[]>(DEFAULT_HOURS);
  const [replyText, setReplyText] = useState(
    "Ficou feliz que tenha gostado 😅 Já deixei o link abaixo. Aproveita porque esse valor costuma acabar rápido ⏰👇",
  );
  const [keywordId, setKeywordId] = useState<string | undefined>();
  const [keyword, setKeyword] = useState<string>("quero");
  const [templateUrl, setTemplateUrl] = useState<string>("");
  const [titleColor, setTitleColor] = useState<string>("#ffffff");
  const [priceColor, setPriceColor] = useState<string>("#facc15");
  const [buttonTitle, setButtonTitle] = useState<string>("VER PARA COMPRAR");

  const DAY_MAP: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };
  const REV_DAY: Record<number, string> = { 0: "dom", 1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sab" };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getConnFn({ data: { channelId } }),
      listKwFn({ data: { channelId } }),
      getTplFn({ data: { channelId } }),
      getSchedFn({ data: { channelId } }),
    ])
      .then(([conn, kws, tpl, sched]) => {
        if (cancelled) return;
        setConnection(conn);
        setAutoPost(conn?.autoPostEnabled ?? true);
        setDisableReply(conn?.disableCommentReply ?? false);
        const first = (kws ?? [])[0];
        if (first) {
          setKeywordId(first.id);
          setKeyword(first.keyword);
          setReplyText(first.comment_reply_text ?? "");
        }
        if (tpl) {
          setTemplateUrl(tpl.image_url ?? "");
          setTitleColor(tpl.title_color ?? "#ffffff");
          setPriceColor(tpl.price_color ?? "#facc15");
        }
        if (sched) {
          setDays((sched.days ?? []).map((n: number) => REV_DAY[n]).filter(Boolean));
          setHours(sched.hours ?? []);
          setSchedActive(sched.active ?? true);
        }
      })
      .catch((e) => toast.error("Falha ao carregar Instagram: " + String(e?.message ?? e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [channelId, getConnFn, listKwFn, getTplFn, getSchedFn]);

  const isConnected = connection?.status === "connected";

  const toggleDay = (d: string) => setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));
  const toggleHour = (h: number) => setHours((p) => (p.includes(h) ? p.filter((x) => x !== h) : [...p, h]));

  const handleConnect = async () => {
    try {
      const { url } = await startOAuthFn({
        data: { channelId },
      });
      window.location.href = url;
    } catch (e: any) { toast.error(String(e?.message ?? e)); }
  };
  const handleDisconnect = async () => {
    if (!confirm("Desconectar Instagram deste canal?")) return;
    try {
      await disconnectFn({ data: { channelId } });
      setConnection(null);
      toast.success("Instagram desconectado.");
    } catch (e: any) { toast.error(String(e?.message ?? e)); }
  };
  const handleFlagToggle = async (patch: {
    autoPostEnabled?: boolean; disableCommentReply?: boolean; growthEnabled?: boolean;
  }) => {
    try { await flagsFn({ data: { channelId, ...patch } }); }
    catch (e: any) { toast.error("Falha ao salvar preferência: " + String(e?.message ?? e)); }
  };
  const handleSaveReply = async () => {
    try {
      await saveKwFn({
        data: {
          channelId, id: keywordId, keyword: keyword || "quero",
          active: true, commentReplyEnabled: !disableReply, commentReplyText: replyText,
        },
      });
      toast.success("Resposta automática salva.");
    } catch (e: any) { toast.error(String(e?.message ?? e)); }
  };
  const handleSaveTemplate = async () => {
    if (!templateUrl) { toast.error("Envie ou informe a URL da imagem do template."); return; }
    try {
      await saveTplFn({
        data: {
          channelId, imageUrl: templateUrl, titleColor, priceColor,
          captionTemplate: "🔥 {title}\n💰 {price}\n\nClique no link 👇\n{link}",
        },
      });
      toast.success("Template salvo.");
    } catch (e: any) { toast.error(String(e?.message ?? e)); }
  };
  const handleSaveSchedule = async () => {
    try {
      await saveSchedFn({
        data: {
          channelId,
          days: days.map((d) => DAY_MAP[d]).filter((n) => n !== undefined),
          hours,
          active: schedActive,
        },
      });
      toast.success("Agendamento salvo.");
    } catch (e: any) { toast.error(String(e?.message ?? e)); }
  };

  return (
    <div className="mt-6 space-y-6">
      {/* Admin (conta única) shortcut */}
      <div className="rounded-2xl border border-border/70 bg-card p-4 sm:flex sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Instagram do administrador (conta única)</p>
          <p className="text-xs text-muted-foreground">Configurações, Publicações, Stories, Comentários, Mensagens e Automações via Meta Graph API.</p>
        </div>
        <Link
          to="/instagram/configuracoes"
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 sm:mt-0"
        >
          <Instagram className="h-4 w-4" /> Abrir módulo Instagram
        </Link>
      </div>
      {/* Instagram gradient banner */}
      <div className="relative overflow-hidden rounded-2xl border border-border/70 p-6 text-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_40px_-24px_rgba(220,50,120,0.55)]">
        <div className="absolute inset-0 bg-[linear-gradient(115deg,#feda75_0%,#fa7e1e_25%,#d62976_55%,#962fbf_80%,#4f5bd5_100%)]" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/20 backdrop-blur">
              <Instagram className="h-6 w-6" strokeWidth={2.2} />
            </span>
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">📸 Instagram</h2>
              <p className="text-[13px] text-white/85">
                {isConnected ? (
                  <>Conta <span className="font-semibold">@{connection?.username}</span></>
                ) : (
                  <>Nenhuma conta conectada ainda</>
                )}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider backdrop-blur">
            <span className={cn("h-1.5 w-1.5 rounded-full", isConnected ? "bg-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.9)]" : "bg-red-300")} />
            {isConnected ? "Conectado" : loading ? "Carregando..." : "Desconectado"}
          </span>
        </div>
      </div>

      {/* Row 1 — account + growth chart */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Conta vinculada" icon={<Users className="h-4 w-4" />}>
          {isConnected ? (
            <>
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <div className="grid h-16 w-16 place-items-center rounded-full bg-[linear-gradient(135deg,#feda75,#d62976,#4f5bd5)] p-[2px]">
                    <div className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-card font-display text-lg font-bold text-foreground">
                      {connection?.profilePicture ? (
                        <img src={connection.profilePicture} alt={connection.username ?? ""} className="h-full w-full object-cover" />
                      ) : (connection?.username ?? "IG").slice(0, 2).toUpperCase()}
                    </div>
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-card bg-emerald-500 text-white">
                    <Check className="h-2.5 w-2.5" strokeWidth={4} />
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-muted-foreground">@{connection?.username}</p>
                  <p className="truncate font-display text-lg font-bold text-foreground">{connection?.name}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-border/70 bg-muted/30 p-3 text-center">
                {[
                  { n: connection?.mediaCount ?? 0, l: "Mídias" },
                  { n: connection?.followers ?? 0, l: "Seguidores" },
                  { n: connection?.follows ?? 0, l: "Seguindo" },
                ].map((s) => (
                  <div key={s.l}>
                    <p className="font-display text-xl font-bold text-foreground">{s.n}</p>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{s.l}</p>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                onClick={handleDisconnect}
                className="mt-4 h-10 w-full rounded-lg border-red-300 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Desconectar Instagram
              </Button>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                Conecte uma conta Instagram Business/Creator vinculada a uma Página do Facebook.
              </p>
              <Button
                onClick={handleConnect}
                className="h-10 rounded-lg bg-gradient-to-r from-[#feda75] via-[#d62976] to-[#4f5bd5] px-6 text-white hover:opacity-95"
              >
                <Instagram className="mr-1.5 h-4 w-4" />
                Conectar Instagram
              </Button>
            </div>
          )}
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
            href="https://www.canva.com/pt_br/design/create/?category=stories"
            target="_blank" rel="noreferrer"
            className="inline-block text-[13px] font-semibold text-primary underline-offset-2 hover:underline"
          >
            Clique aqui para editar o template no Canva
          </a>

          <Field label="URL da imagem base (1080x1920)">
            <Input
              value={templateUrl}
              onChange={(e) => setTemplateUrl(e.target.value)}
              placeholder="https://.../template.jpg"
              className="h-10"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Cor do Título">
              <input
                type="color" value={titleColor}
                onChange={(e) => setTitleColor(e.target.value)}
                className="h-10 w-full cursor-pointer rounded-lg border border-border bg-background"
              />
            </Field>
            <Field label="Cor do Preço">
              <input
                type="color" value={priceColor}
                onChange={(e) => setPriceColor(e.target.value)}
                className="h-10 w-full cursor-pointer rounded-lg border border-border bg-background"
              />
            </Field>
          </div>

          <Button
            onClick={handleSaveTemplate}
            className="h-10 w-full rounded-lg bg-gradient-to-r from-[oklch(0.7_0.19_45)] to-[oklch(0.62_0.22_25)] text-white shadow-[0_10px_24px_-14px_rgba(220,80,20,0.6)] hover:opacity-95"
          >
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
      <SectionCard title="Resposta automática do story" icon={<Send className="h-4 w-4" />}>
        <div className="space-y-2">
          <div className="flex items-start gap-2 rounded-lg border border-[oklch(0.85_0.15_85)]/40 bg-[oklch(0.98_0.05_90)] px-3 py-2 text-[12px] leading-relaxed text-[oklch(0.42_0.12_75)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Não há compatibilidade com figurinhas (links, enquetes, localização).</span>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-[12px] leading-relaxed text-primary">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              📢 O template deve conter a chamada: <b>"Comente {keyword.toUpperCase()} para receber o link!"</b>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ToggleRow
            label="Post automático"
            description="Publicar stories automaticamente"
            checked={autoPost}
            onChange={(v) => { setAutoPost(v); void handleFlagToggle({ autoPostEnabled: v }); }}
          />
          <ToggleRow
            label="Desativar resposta no comentário"
            description="Não enviar DM para quem comentar"
            checked={disableReply}
            onChange={(v) => { setDisableReply(v); void handleFlagToggle({ disableCommentReply: v }); }}
          />
        </div>

        <Field label="Palavra-chave (comentário / resposta de story)">
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value.slice(0, 40))}
            placeholder="quero"
            className="h-10 font-mono uppercase"
          />
        </Field>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Texto da resposta automática ao story
            </label>
            <span className="text-[11px] text-muted-foreground">{replyText.length}/500</span>
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
            value={buttonTitle}
            onChange={(e) => setButtonTitle(e.target.value.slice(0, 20))}
            className="h-10 font-mono uppercase"
          />
        </Field>

        <div className="flex justify-end">
          <Button
            onClick={handleSaveReply}
            className="h-10 rounded-lg bg-gradient-to-r from-[oklch(0.7_0.19_45)] to-[oklch(0.62_0.22_25)] px-6 text-white shadow-[0_10px_24px_-14px_rgba(220,80,20,0.6)] hover:opacity-95"
          >
            <Save className="mr-1.5 h-4 w-4" />
            Salvar
          </Button>
        </div>
      </SectionCard>

      {/* Row 4 — schedule + tips */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <SectionCard title="Agendamento recorrente do story" icon={<Calendar className="h-4 w-4" />}>
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
            <Button
              onClick={handleSaveSchedule}
              className="h-10 rounded-lg bg-primary px-6 hover:bg-primary/90"
            >
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
                <span>Limite de até <b>25 posts automáticos</b> por 24 horas.</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" strokeWidth={3} />
                <span>Proporção correta de <b>9:16 (1080×1920px)</b>.</span>
              </li>
              <li className="flex items-start gap-2 rounded-lg border border-[oklch(0.85_0.15_85)]/40 bg-[oklch(0.98_0.05_90)] px-2 py-2 text-[12px] text-[oklch(0.42_0.12_75)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Se o Instagram desconectar, reconecte usando <b>4G</b> ao invés de Wi-Fi.</span>
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

/* InstaBotHelp panel lives in src/components/instabot/InstaBotHelpPanel.tsx */

/* -------- WhatsApp Groups tab -------- */

type WaListItem = {
  id: string;
  name: string;
  members: number | null;
  selected: boolean;
  pictureUrl: string | null;
};

function WhatsAppGroupsPanel() {
  const { id: channelId } = Route.useParams();
  const listFn = useServerFn(listMonitorGroups);
  const saveFn = useServerFn(saveMonitorGroups);

  const [subTab, setSubTab] = useState<"grupos" | "canais">("grupos");
  const [noImage, setNoImage] = useState(false);
  const [groups, setGroups] = useState<WaListItem[]>([]);
  const [channels, setChannels] = useState<WaListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      try {
        const rows = await listFn({ data: { channelId } });
        const mapped: WaListItem[] = rows.map((r) => ({
          id: r.jid,
          name: r.name,
          members: r.participants,
          selected: r.selected,
          pictureUrl: r.pictureUrl,
        }));
        setGroups(mapped);
        setChannels([]);
        if (mode === "refresh") {
          toast.success(`Lista atualizada — ${mapped.length} grupo(s)`);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha ao carregar grupos");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [listFn, channelId],
  );

  useEffect(() => {
    void reload("initial");
  }, [reload]);

  const list = subTab === "grupos" ? groups : channels;
  const setList = subTab === "grupos" ? setGroups : setChannels;
  const toggle = (id: string) =>
    setList((prev) => prev.map((g) => (g.id === id ? { ...g, selected: !g.selected } : g)));

  const selectedCount = list.filter((g) => g.selected).length;

  const onSave = async () => {
    if (subTab !== "grupos") return;
    setSaving(true);
    try {
      const picked = groups
        .filter((g) => g.selected)
        .slice(0, 5)
        .map((g) => ({ jid: g.id, name: g.name, platform: "whatsapp" }));
      await saveFn({ data: { channelId, groups: picked } });
      toast.success("Grupos salvos");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="mt-6 space-y-6">
      <WhatsAppInstancePanel channelId={channelId} />



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

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-lg"
            onClick={() => void reload("refresh")}
            disabled={refreshing || loading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} /> Atualizar
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
          {loading ? (
            <li className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">Carregando grupos…</li>
          ) : list.length === 0 ? (
            <li className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">
              Nenhum grupo encontrado. Conecte o WhatsApp neste canal e clique em <b>Atualizar</b>.
            </li>
          ) : (
            list.map((g) => (
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
                  {g.pictureUrl ? (
                    <img src={g.pictureUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[oklch(0.9_0.05_155)] to-[oklch(0.82_0.09_150)] font-display text-[13px] font-bold text-[oklch(0.35_0.15_155)]">
                      {g.name.replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 2).toUpperCase() || "?"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-foreground">{g.name}</p>
                    <p className="text-[11.5px] text-muted-foreground">
                      {g.members != null ? `${g.members} membros` : "—"}
                    </p>
                  </div>
                  {g.selected && (
                    <span className="rounded-full bg-[oklch(0.94_0.08_150)] px-2 py-0.5 text-[10px] font-bold uppercase text-[oklch(0.42_0.15_155)]">
                      Ativo
                    </span>
                  )}
                </label>
              </li>
            ))
          )}
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
            onClick={() => void onSave()}
            disabled={saving || subTab !== "grupos"}
            className="gap-2 rounded-full bg-primary px-8 shadow-[0_10px_30px_-12px_oklch(0.62_0.19_256/0.6)] hover:bg-primary/90"
          >
            <Save className="h-4 w-4" /> {saving ? "Salvando…" : "Salvar configurações"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------- WhatsApp Monitor tab -------- */

const MAX_MONITOR = 5;

function WhatsAppMonitorPanel({ channelId }: { channelId: string }) {
  const listFn = useServerFn(listMonitorGroups);
  const saveFn = useServerFn(saveMonitorGroups);

  const [groups, setGroups] = useState<MonitorGroupDTO[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      try {
        const rows = await listFn({ data: { channelId } });
        setGroups(rows);
        setSelected((prev) => {
          // Preserva o que o usuário já marcou nesta sessão + o que veio salvo
          // do servidor. Remove apenas o que não existe mais na conta.
          const validJids = new Set(rows.map((r) => r.jid));
          const next = new Set<string>();
          for (const jid of prev) if (validJids.has(jid)) next.add(jid);
          for (const r of rows) if (r.selected) next.add(r.jid);
          return next;
        });
        if (mode === "refresh") {
          toast.success(`Lista atualizada — ${rows.length} grupo(s)`);
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Falha ao carregar grupos",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [listFn, channelId],
  );

  useEffect(() => {
    void reload("initial");
  }, [reload]);

  const toggle = (jid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(jid)) {
        next.delete(jid);
      } else {
        if (next.size >= MAX_MONITOR) return prev;
        next.add(jid);
      }
      return next;
    });
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const picked = groups
        .filter((g) => selected.has(g.jid))
        .map((g) => ({ jid: g.jid, name: g.name, platform: g.platform }));
      await saveFn({ data: { channelId, groups: picked } });
      toast.success("Grupos monitorados salvos");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const count = selected.size;
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
            grupos monitorados
          </span>

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-lg"
            onClick={() => void reload("refresh")}
            disabled={refreshing || loading}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
            />{" "}
            Atualizar lista de grupos
          </Button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <div className="col-span-full py-10 text-center text-sm text-muted-foreground">
              Carregando grupos…
            </div>
          ) : groups.length === 0 ? (
            <div className="col-span-full py-10 text-center text-sm text-muted-foreground">
              Nenhum grupo encontrado. Conecte uma instância de WhatsApp neste
              canal e clique em <b>Atualizar lista de grupos</b>.
            </div>
          ) : (
            groups.map((g) => {
              const checked = selected.has(g.jid);
              const disabled = !checked && atLimit;
              return (
                <label
                  key={g.jid}
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
                    onChange={() => !disabled && toggle(g.jid)}
                  />
                  {g.pictureUrl ? (
                    <img
                      src={g.pictureUrl}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[oklch(0.9_0.05_155)] to-[oklch(0.82_0.09_150)] font-display text-[12px] font-bold text-[oklch(0.35_0.15_155)]">
                      {g.name.replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 2).toUpperCase() || "?"}
                    </div>
                  )}
                  <span className="truncate text-[13px] font-medium text-foreground">
                    {g.name}
                  </span>
                </label>
              );
            })
          )}
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
            onClick={() => void onSave()}
            disabled={saving}
            className="gap-2 rounded-full bg-primary px-8 shadow-[0_10px_30px_-12px_oklch(0.62_0.19_256/0.6)] hover:bg-primary/90"
          >
            <Save className="h-4 w-4" />{" "}
            {saving ? "Salvando…" : "Salvar grupos monitorados"}
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
  itemId?: string | null;
  title: string;
  emoji: string;
  color: string;
  format: "STORY" | "FEED";
  price: string;
  original: string;
  discount: number;
  when: string;
  permalink?: string;
  thumbnail?: string | null;
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

function channelProductToML(row: ChannelProductDTO): MLProduct {
  const current = row.promoPrice ?? row.originalPrice;
  const original = row.originalPrice;
  const discount = current != null && original != null && original > current
    ? Math.round((1 - current / original) * 100)
    : 0;
  return {
    id: row.id,
    itemId: row.itemId,
    title: row.title,
    emoji: "🛍️",
    color: "oklch(0.92 0.06 80)",
    format: "FEED",
    price: formatBRL(current),
    original: formatBRL(original),
    discount,
    when: new Date(row.createdAt).toLocaleDateString("pt-BR"),
    permalink: row.affiliateLink || row.rawLink,
    thumbnail: row.imageUrl,
  };
}

function MercadoLivrePanel({ onCountsChanged }: { onCountsChanged?: () => void } = {}) {
  const { id: channelId } = Route.useParams();

  const [autoAffiliate, setAutoAffiliate] = useState(true);
  const [bestSellers, setBestSellers] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [sendProduct, setSendProduct] = useState<SendProduct | null>(null);
  const [editTarget, setEditTarget] = useState<EditProductTarget | null>(null);
  const [channelProducts, setChannelProducts] = useState<MLProduct[]>([]);
  const allChecked = channelProducts.length > 0 && channelProducts.every((p) => selected[p.id]);

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
  const listProductsFn = useServerFn(listChannelProducts);

  const reloadProducts = useCallback(async () => {
    const rows = await listProductsFn({ data: { channelId, platform: "mercadolivre" } });
    setChannelProducts(rows.map(channelProductToML));
    onCountsChanged?.();
  }, [channelId, listProductsFn, onCountsChanged]);

  useEffect(() => {
    void reloadProducts().catch((err) => {
      toast.error("Falha ao carregar produtos", {
        description: err instanceof Error ? err.message : undefined,
      });
    });
  }, [reloadProducts]);

  const handleAddByLink = async () => {
    const link = linkInput.trim();
    if (!link) {
      toast.error("Cole um link do Mercado Livre.");
      return;
    }
    setAddingLink(true);
    try {
      const res = await addByLinkFn({ data: { channelId, link } });
      const label = res.inserted > 0 ? "Produto adicionado" : "Produto atualizado";
      toast.success(label, {
        description: `${res.product.title.slice(0, 60)}${res.product.title.length > 60 ? "…" : ""}`,
      });
      if (!res.product.affiliateReady && autoAffiliate) {
        toast.message("Configure sua conta Mercado Livre em Afiliados para gerar link comissionado.");
      }
      setLinkInput("");
      await reloadProducts();
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
      const res = await addByIdsFn({ data: { channelId, ids: [id] } });
      if (res.inserted + res.updated > 0) {
        setAddedIds((s) => new Set(s).add(id));
        toast.success(res.inserted > 0 ? "Produto adicionado" : "Produto atualizado");
        await reloadProducts();
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
              <p className="text-[12px] text-muted-foreground">{channelProducts.length} produtos vinculados a este canal</p>
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
                    channelProducts.forEach((p) => (next[p.id] = v));
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
          {channelProducts.map((p) => (
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
                  <Button
                    size="sm"
                    onClick={() =>
                      setSendProduct({
                        title: p.title,
                        link: p.permalink ?? "",
                        price: p.price,
                        price_original: p.original,
                        image: p.thumbnail,
                      })
                    }
                    className="h-8 gap-1 rounded-md bg-[oklch(0.62_0.19_150)] px-1.5 text-[11px] hover:bg-[oklch(0.55_0.19_150)]"
                  >
                    <MessageCircle className="h-3 w-3" /> Grupos
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setEditTarget({ kind: "byId", id: p.id })
                    }
                    className="h-8 gap-1 rounded-md px-1.5 text-[11px]"
                  >
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
          <p className="text-[12px] text-muted-foreground">{channelProducts.length} produtos neste grupo</p>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-8 rounded-md">Anterior</Button>
            <Button size="sm" className="h-8 min-w-[32px] rounded-md bg-primary px-2">1</Button>
            <Button size="sm" variant="outline" className="h-8 min-w-[32px] rounded-md px-2">2</Button>
            <Button size="sm" variant="outline" className="h-8 min-w-[32px] rounded-md px-2">3</Button>
            <Button size="sm" variant="outline" className="h-8 rounded-md">Próximo</Button>
          </div>
        </div>
      </div>
      <SendToGroupsModal
        open={sendProduct !== null}
        onClose={() => setSendProduct(null)}
        product={sendProduct}
        channelId={Route.useParams().id}
      />
      <EditProductModal
        open={editTarget !== null}
        channelId={channelId}
        target={editTarget}

        onClose={() => setEditTarget(null)}
        onSaved={(updated) => {
          setChannelProducts((prev) => prev.map((p) => p.id === updated.id
            ? channelProductToML({
                id: updated.id,
                channelId,
                platform: updated.platform,
                itemId: updated.item_id,
                title: updated.title,
                imageUrl: updated.image_url,
                rawLink: updated.raw_link,
                affiliateLink: updated.affiliate_link,
                originalPrice: updated.original_price,
                promoPrice: updated.promo_price,
                commissionRate: null,
                sales: null,
                availability: updated.availability,
                createdAt: updated.created_at,
              })
            : p));
          setEditTarget(null);
        }}
      />
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
  itemId?: string | null;
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

function ShopeePanel({ onCountsChanged }: { onCountsChanged?: () => void } = {}) {
  const { id: channelId } = Route.useParams();

  const [tags, setTags] = useState<ShopeeTag[]>(SHOPEE_TAGS);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [importedProducts, setImportedProducts] = useState<ShopeeProduct[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkAction, setBulkAction] = useState<string>("");
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [sendProduct, setSendProduct] = useState<SendProduct | null>(null);
  const [editTarget, setEditTarget] = useState<EditProductTarget | null>(null);
  const [importGroups, setImportGroups] = useState<AutomationGroupDTO[]>([]);
  const [importGroupJid, setImportGroupJid] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importBatchFn = useServerFn(importShopeeBatch);
  const listPendingFn = useServerFn(listPendingShopeeImages);
  const enrichBatchFn = useServerFn(enrichShopeeImagesBatch);
  const deleteByItemsFn = useServerFn(deleteProductsByItemIds);
  const deleteAllFn = useServerFn(deleteAllProducts);
  const listProductsFn = useServerFn(listChannelProducts);
  const listImportGroupsFn = useServerFn(listAutomationGroups);

  const products = importedProducts.filter((p) => !deletedIds.has(p.id));
  const allChecked = products.length > 0 && products.every((p) => selected[p.id]);

  // Extract Shopee item_id from a preview product id like `csv-<itemId>-<idx>`
  const extractItemId = (previewId: string): string | null => {
    const product = importedProducts.find((p) => p.id === previewId);
    if (product?.itemId) return product.itemId;
    const m = /^csv-(.+)-\d+$/.exec(previewId);
    return m ? m[1] : null;
  };

  const rowToStoredProduct = (row: ChannelProductDTO): ShopeeProduct => {
    const current = row.promoPrice ?? row.originalPrice;
    const original = row.originalPrice;
    const discount = current != null && original != null && original > current
      ? Math.round((1 - current / original) * 100)
      : Math.round(row.commissionRate ?? 0);
    return {
      id: row.id,
      itemId: row.itemId,
      title: row.title,
      emoji: "🛍️",
      color: "oklch(0.92 0.06 30)",
      format: "FEED",
      price: formatBRL(current),
      original: formatBRL(original),
      discount,
      when: new Date(row.createdAt).toLocaleDateString("pt-BR"),
      affiliateLink: row.affiliateLink,
      rawLink: row.rawLink,
      imageUrl: row.imageUrl ?? undefined,
    };
  };

  const reloadProducts = useCallback(async () => {
    const rows = await listProductsFn({ data: { channelId, platform: "shopee" } });
    setImportedProducts(rows.map(rowToStoredProduct));
    setDeletedIds(new Set());
    onCountsChanged?.();
  }, [channelId, listProductsFn, onCountsChanged]);

  useEffect(() => {
    void reloadProducts().catch((err) => {
      toast.error("Falha ao carregar produtos", {
        description: err instanceof Error ? err.message : undefined,
      });
    });
  }, [reloadProducts]);

  useEffect(() => {
    void listImportGroupsFn({ data: { channelId } })
      .then((rows) => {
        setImportGroups(rows);
        // Grupo base = grupo já vinculado a este canal. Auto-seleciona sem UI.
        setImportGroupJid((current) => {
          if (rows.some((row) => row.groupId === current)) return current;
          return rows[0]?.groupId ?? "";
        });
      })
      .catch(() => setImportGroups([]));
  }, [channelId, listImportGroupsFn]);

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
        await deleteAllFn({ data: { channelId, platform: "shopee" } });
        setImportedProducts([]);
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
        await deleteByItemsFn({ data: { channelId, platform: "shopee", itemIds } });
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

  const handlePickCsv = () => {
    if (!importGroupJid) {
      toast.error("Nenhum grupo vinculado a este canal. Vincule um grupo antes de importar.");
      return;
    }
    fileInputRef.current?.click();
  };

  const enrichImagesInBackground = async () => {
    try {
      const pending = await listPendingFn({ data: { channelId } });
      if (!pending || pending.length === 0) return;
      const total = pending.length;
      let done = 0;
      let found = 0;
      const toastId = toast.loading("Buscando imagens dos produtos...", {
        description: `0 / ${total}`,
      });

      // Divide em chunks de 8 e roda 3 chunks em paralelo (=24 scrapes simultâneos).
      const CHUNK = 8;
      const PARALLEL_CHUNKS = 3;
      const chunks: (typeof pending)[] = [];
      for (let i = 0; i < pending.length; i += CHUNK) {
        chunks.push(pending.slice(i, i + CHUNK));
      }

      // Buffers para não re-renderizar a lista/toast a cada resposta.
      const pendingUpdates = new Map<string, string>(); // itemId → url
      let lastFlush = 0;
      const flush = (force = false) => {
        const now = Date.now();
        if (!force && now - lastFlush < 350) return;
        lastFlush = now;
        if (pendingUpdates.size > 0) {
          const patch = new Map(pendingUpdates);
          pendingUpdates.clear();
          setImportedProducts((prev) =>
            prev.map((p) => {
              const id = extractItemId(p.id);
              const img = id ? patch.get(id) : undefined;
              return img ? { ...p, imageUrl: img } : p;
            }),
          );
        }
        toast.loading("Buscando imagens dos produtos...", {
          id: toastId,
          description: `Imagens encontradas: ${found} / ${done} (de ${total})`,
        });
      };

      let cursor = 0;
      const worker = async (): Promise<void> => {
        while (cursor < chunks.length) {
          const idx = cursor++;
          const chunk = chunks[idx]!;
          try {
            const res = await enrichBatchFn({ data: { channelId, items: chunk } });
            for (const r of res.results) {
              if (r.found) {
                found += 1;
                if (r.itemId && r.image) pendingUpdates.set(r.itemId, r.image);
              }
            }
          } catch {
            /* ignora falhas de chunk individual */
          }
          done += chunk.length;
          flush();
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(PARALLEL_CHUNKS, chunks.length) }, () => worker()),
      );
      flush(true);
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
        const outcome = await importBatchFn({
          data: { channelId, sourceGroupJid: importGroupJid, rows: chunk },
        });
        inserted += outcome.inserted;
        updated += outcome.updated;
        setProgress({ done: Math.min(i + chunk.length, rows.length), total: rows.length });
      }

      await reloadProducts();

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
          <p className="text-[12.5px] text-white/85">{products.length} produtos vinculados · gerencie categorias, textos padrão e importe em massa.</p>
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
              disabled={importing || !importGroupJid}
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
              <p className="text-[12px] text-muted-foreground">{products.length} produtos vinculados a este canal</p>
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
                  <Button
                    size="sm"
                    onClick={() =>
                      setSendProduct({
                        title: p.title,
                        link: p.affiliateLink ?? p.rawLink ?? "",
                        price: p.price,
                        price_original: p.original,
                        image: p.imageUrl ?? null,
                      })
                    }
                    className="h-8 gap-1 rounded-md bg-[oklch(0.62_0.19_150)] px-1.5 text-[11px] hover:bg-[oklch(0.55_0.19_150)]"
                  >
                    <MessageCircle className="h-3 w-3" /> Grupos
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const m = /^csv-(.+)-\d+$/.exec(p.id);
                      const itemId = m?.[1] ?? p.id;
                      setEditTarget({ kind: "byItem", platform: "shopee", itemId });
                    }}
                    className="h-8 gap-1 rounded-md px-1.5 text-[11px]"
                  >
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
          <p className="text-[12px] text-muted-foreground">{products.length} produtos neste grupo</p>
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
      <SendToGroupsModal
        open={sendProduct !== null}
        onClose={() => setSendProduct(null)}
        product={sendProduct}
        channelId={Route.useParams().id}
      />
      <EditProductModal
        open={editTarget !== null}
        channelId={channelId}
        target={editTarget}

        onClose={() => setEditTarget(null)}
        onSaved={(updated) => {
          setImportedProducts((prev) =>
            prev.map((p) => {
              const m = /^csv-(.+)-\d+$/.exec(p.id);
              const itemId = m?.[1] ?? p.id;
              if (itemId !== updated.item_id) return p;
              return {
                ...p,
                title: updated.title,
                imageUrl: updated.image_url ?? p.imageUrl,
                affiliateLink: updated.affiliate_link,
                rawLink: updated.raw_link,
                price: updated.promo_price != null ? `R$ ${updated.promo_price.toFixed(2).replace(".", ",")}` : p.price,
                original: updated.original_price != null ? `R$ ${updated.original_price.toFixed(2).replace(".", ",")}` : p.original,
                discount:
                  updated.original_price && updated.promo_price && updated.original_price > 0
                    ? Math.round(((updated.original_price - updated.promo_price) / updated.original_price) * 100)
                    : p.discount,
              };
            }),
          );
          setEditTarget(null);
        }}
      />
    </div>
  );
}

function WhatsAppSessionsPanel() {
  const { id: channelId } = Route.useParams();
  const listFn = useServerFn(listWhatsAppSessions);
  const createFn = useServerFn(createWhatsAppSession);
  const confirmFn = useServerFn(confirmWhatsAppSession);
  const getLinkFn = useServerFn(getChannelWhatsAppSession);
  const linkFn = useServerFn(linkChannelToSession);
  const unlinkFn = useServerFn(unlinkChannelSession);

  const [sessions, setSessions] = useState<WASessionDTO[]>([]);
  const [linked, setLinked] = useState<WASessionDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerId, setPickerId] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);

  // create-new modal
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [list, link] = await Promise.all([
        listFn(),
        getLinkFn({ data: { channelId } }),
      ]);
      setSessions(list);
      setLinked(link.session);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar sessões");
    } finally {
      setLoading(false);
    }
  }, [listFn, getLinkFn, channelId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // poll while pending new session
  useEffect(() => {
    if (!pendingSessionId) return;
    const iv = window.setInterval(async () => {
      try {
        const list = await listFn();
        setSessions(list);
        const s = list.find((x) => x.id === pendingSessionId);
        if (s?.status === "connected") {
          window.clearInterval(iv);
          toast.success("Sessão WhatsApp conectada");
          setPendingSessionId(null);
        }
      } catch {
        /* silent */
      }
    }, 3000);
    return () => window.clearInterval(iv);
  }, [pendingSessionId, listFn]);

  const connected = sessions.filter((s) => s.status === "connected");

  const handleLink = async () => {
    if (!pickerId) return;
    try {
      setBusy("link");
      await linkFn({ data: { channelId, sessionId: pickerId } });
      toast.success("Sessão vinculada");
      setPickerId("");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao vincular");
    } finally {
      setBusy(null);
    }
  };

  const handleUnlink = async () => {
    try {
      setBusy("unlink");
      await unlinkFn({ data: { channelId } });
      setLinked(null);
      toast.success("Sessão desvinculada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao desvincular");
    } finally {
      setBusy(null);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      setBusy("create");
      const res = await createFn({ data: { name: newName.trim() } });
      setPendingSessionId(res.id);
      setNewName("");
      toast.success("Sessão criada. Escaneie o QR Code na extensão.");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar sessão");
    } finally {
      setBusy(null);
    }
  };

  const handleSimulateConnect = async (sessionId: string) => {
    // Manual confirm helper (extension will do this automatically in prod)
    try {
      setBusy(`confirm:${sessionId}`);
      await confirmFn({ data: { sessionId } });
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao confirmar");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[15px] font-bold uppercase tracking-wider text-foreground">
          Sessões WhatsApp
        </h3>
        <span className="text-[12px] font-semibold text-muted-foreground">
          <span className="text-foreground">{connected.length}</span> conectadas
        </span>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
          Carregando…
        </div>
      ) : linked ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{linked.name}</p>
            <p className="text-[12.5px] text-muted-foreground">
              {linked.phoneNumber ?? "Número não informado"}
            </p>
            <span
              className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                linked.status === "connected"
                  ? "bg-[oklch(0.94_0.08_150)] text-[oklch(0.42_0.15_155)]"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {linked.status === "connected" ? "Conectado" : linked.status}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleUnlink} disabled={busy === "unlink"}>
              Desvincular
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">
            Nenhuma sessão WhatsApp vinculada a este canal.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={pickerId}
              onChange={(e) => setPickerId(e.target.value)}
              className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm"
            >
              <option value="">Usar número existente…</option>
              {connected.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.phoneNumber ? `— ${s.phoneNumber}` : ""}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={handleLink} disabled={!pickerId || busy === "link"}>
              🔗 Vincular
            </Button>
          </div>
          <div className="pt-1">
            {creating ? (
              <div className="space-y-2 rounded-lg border border-dashed border-border/70 p-3">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nome da sessão (ex: Loja Principal)"
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                />
                {pendingSessionId ? (
                  <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                    Sessão criada. Abra a extensão em web.whatsapp.com e escaneie o QR Code.
                    Aguardando autenticação…
                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSimulateConnect(pendingSessionId)}
                        disabled={busy?.startsWith("confirm")}
                      >
                        Já autenticado? Confirmar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleCreate} disabled={busy === "create" || !newName.trim()}>
                      Criar sessão
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
                      Cancelar
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
                ⊕ Conectar novo número
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function WhatsAppConnectionCard() {
  const { id: channelId } = Route.useParams();
  const loadFn = useServerFn(getWhatsAppConnection);
  const generateFn = useServerFn(generateWhatsAppToken);
  const reconnectFn = useServerFn(reconnectWhatsApp);
  const sessionFn = useServerFn(getWhatsAppSession);
  const disconnectFn = useServerFn(disconnectWhatsAppSession);

  const [connection, setConnection] = useState<WhatsAppConnectionDTO | null>(null);
  const [session, setSession] = useState<WhatsAppSessionDTO | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"generate" | "reconnect" | "disconnect" | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      loadFn({ data: { channelId } }),
      sessionFn({ data: { channelId } }),
    ])
      .then(([conn, sess]) => {
        if (!alive) return;
        setConnection(conn);
        setSession(sess);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Falha ao carregar conexão"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [channelId, loadFn, sessionFn]);

  // Effective status combines link+session: connected requires session=connected
  const effectiveStatus: "disconnected" | "pending" | "connected" =
    session?.status === "connected"
      ? "connected"
      : session?.status === "disconnected"
        ? "disconnected"
        : connection?.status ?? "disconnected";

  // Poll session every 3s while pending
  useEffect(() => {
    if (effectiveStatus !== "pending") return;
    let alive = true;
    const iv = window.setInterval(async () => {
      try {
        const s = await sessionFn({ data: { channelId } });
        if (!alive) return;
        setSession(s);
        if (s?.status === "connected") {
          window.clearInterval(iv);
          toast.success("WhatsApp conectado");
        }
      } catch {
        /* silent */
      }
    }, 3000);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, [effectiveStatus, channelId, sessionFn]);

  const statusMeta = {
    disconnected: { label: "Não conectado", cls: "bg-muted text-muted-foreground" },
    pending: { label: "Aguardando conexão", cls: "bg-[oklch(0.94_0.09_75)] text-[oklch(0.42_0.15_60)]" },
    connected: { label: "Conectado", cls: "bg-[oklch(0.94_0.08_150)] text-[oklch(0.42_0.15_155)]" },
  }[effectiveStatus];

  const handleGenerate = async () => {
    try {
      setBusy("generate");
      const res = await generateFn({ data: { channelId } });
      setConnection(res.connection);
      setSession(null);
      setToken(res.token);
      toast.success("Token gerado. Copie e cole na extensão.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar token");
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async () => {
    if (!token) {
      toast.info("Gere um token primeiro. Por segurança ele só aparece uma vez.");
      return;
    }
    try {
      await navigator.clipboard.writeText(`${token}|${channelId}`);
      toast.success("Token copiado (inclui o canal)");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const handleReconnect = async () => {
    try {
      setBusy("reconnect");
      const res = await reconnectFn({ data: { channelId } });
      setConnection(res);
      setSession(null);
      setToken(null);
      toast.success("Solicitação de reconexão enviada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao reconectar");
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnect = async () => {
    try {
      setBusy("disconnect");
      await disconnectFn({ data: { channelId } });
      setSession((s) => (s ? { ...s, status: "disconnected", connectedAt: null } : s));
      setConnection((c) => (c ? { ...c, status: "disconnected", connectedAt: null } : c));
      toast.success("Número desconectado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao desconectar");
    } finally {
      setBusy(null);
    }
  };

  const formatWhen = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("pt-BR");
    } catch {
      return iso;
    }
  };

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[oklch(0.72_0.18_150)] to-[oklch(0.55_0.2_155)] text-white">
            <MessageCircle className="h-5 w-5" strokeWidth={2.4} />
          </div>
          <div>
            <h3 className="font-display text-base font-bold text-foreground">Conexão WhatsApp</h3>
            <p className="text-[12.5px] text-muted-foreground">
              Vincule este canal ao seu WhatsApp usando o token de conexão.
            </p>
            <span
              className={cn(
                "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                statusMeta.cls,
              )}
            >
              {loading ? "Carregando…" : statusMeta.label}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {effectiveStatus !== "connected" ? (
            <>
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={busy !== null || loading}
                className="rounded-lg"
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                {busy === "generate" ? "Gerando…" : "Gerar token de conexão"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopy}
                disabled={!token}
                className="rounded-lg"
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar token
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleReconnect}
                disabled={busy !== null || loading}
                className="rounded-lg"
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                {busy === "reconnect" ? "Reconectando…" : "Reconectar"}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={handleDisconnect}
              disabled={busy !== null}
              className="rounded-lg"
            >
              {busy === "disconnect" ? "Desconectando…" : "Desconectar número"}
            </Button>
          )}
        </div>
      </div>

      {effectiveStatus === "connected" ? (
        <div className="mt-4 grid gap-2 rounded-lg border border-[oklch(0.85_0.09_150)] bg-[oklch(0.97_0.05_150)] p-4 text-[13px]">
          <div className="flex items-center gap-2 font-semibold text-[oklch(0.35_0.15_155)]">
            <Check className="h-4 w-4" /> WhatsApp conectado
          </div>
          <div className="text-muted-foreground">
            <b className="text-foreground">Número:</b> {session?.phoneNumber || "não informado"}
          </div>
          <div className="text-muted-foreground">
            <b className="text-foreground">Última conexão:</b> {formatWhen(session?.connectedAt || session?.lastSeenAt || null)}
          </div>
        </div>
      ) : effectiveStatus === "pending" ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/40 p-3 text-[12.5px] text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Aguardando conexão… abra a extensão, escaneie o QR Code no WhatsApp Web e o painel atualiza sozinho.
        </div>
      ) : null}

      {token && effectiveStatus !== "connected" && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/40 p-3 font-mono text-[12.5px]">
          <span className="text-muted-foreground">Token:</span>
          <span className="break-all font-semibold text-foreground">{token}|{channelId}</span>
          <span className="ml-auto text-[10.5px] uppercase tracking-wider text-muted-foreground">
            visível somente agora
          </span>
        </div>
      )}
    </div>
  );

}

