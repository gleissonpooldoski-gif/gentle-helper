import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  Calendar,
  Download,
  Filter,
  Info,
  Package,
  PieChart as PieChartIcon,
  RefreshCcw,
  Search,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Store,
  TrendingUp,
  User,
} from "lucide-react";


import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  listReports,
  syncReports,
  type ConversionRow,
  type ReportFilters,
} from "@/modules/reports/reports.functions";
import { listChannels, type ChannelDTO } from "@/modules/channels/channels.functions";
import { toast } from "sonner";

function downloadConversionsCsv(rows: ConversionRow[]) {
  const headers = [
    "order_id","order_date","status","platform","store_name","product_name",
    "value","commission","commission_pct","qty","buyer_type","device",
  ];
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.order_id, r.order_date, r.status, r.platform, r.store_name ?? "",
      r.product_name, r.value, r.commission, r.commission_pct, r.qty,
      r.buyer_type, r.device,
    ].map(escape).join(","));
  }
  const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `relatorio-shopee-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const Route = createFileRoute("/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios Shopee · DivulgaLinks" },
      {
        name: "description",
        content:
          "Acompanhe suas conversões, comissões e vendas Shopee em tempo real com filtros avançados e detalhamento por pedido.",
      },
      { property: "og:title", content: "Relatórios Shopee · DivulgaLinks" },
      {
        property: "og:description",
        content: "Analytics de vendas Shopee para afiliados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsPage,
});

type OrderStatus = "PENDENTE" | "COMPLETO" | "CANCELADO";
type BuyerType = "NEW" | "EXISTING";

const currency = (v: number) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

interface DraftFilters {
  channelId: string;
  platform: string;
  dateFrom: string;
  dateTo: string;
  status: string;
  buyer: string;
  device: string;
  store: string;
  product: string;
  orderId: string;
  pageSize: string;
}

const defaultDraft = (): DraftFilters => {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    channelId: "all",
    platform: "all",
    dateFrom: iso(first),
    dateTo: iso(today),
    status: "all",
    buyer: "all",
    device: "all",
    store: "",
    product: "",
    orderId: "",
    pageSize: "100",
  };
};

function ReportsPage() {
  const [draft, setDraft] = useState<DraftFilters>(defaultDraft);
  const [applied, setApplied] = useState<DraftFilters>(draft);
  const [tableFilter, setTableFilter] = useState("");
  const [channels, setChannels] = useState<ChannelDTO[]>([]);

  const fetchReports = useServerFn(listReports);
  const runSync = useServerFn(syncReports);
  const listChannelsFn = useServerFn(listChannels);

  useEffect(() => {
    let cancelled = false;
    void listChannelsFn()
      .then((rows) => {
        if (!cancelled) setChannels(rows);
      })
      .catch(() => {
        if (!cancelled) setChannels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [listChannelsFn]);

  const filters: ReportFilters = useMemo(
    () => ({
      channelId: applied.channelId && applied.channelId !== "all" ? applied.channelId : null,
      platform: applied.platform,
      dateFrom: applied.dateFrom || null,
      dateTo: applied.dateTo || null,
      status: applied.status,
      buyer: applied.buyer,
      device: applied.device,
      store: applied.store || null,
      product: applied.product || null,
      orderId: applied.orderId || null,
      limit: Number(applied.pageSize) || 100,
    }),
    [applied],
  );

  const query = useQuery({
    queryKey: ["reports", filters],
    queryFn: () => fetchReports({ data: filters }),
  });

  const sync = useMutation({
    mutationFn: () => runSync({ data: {} }),
    onSuccess: (r: { inserted?: number; pages?: number } | void) => {
      const ins = r && typeof r === "object" && "inserted" in r ? r.inserted ?? 0 : 0;
      toast.success(`Sincronização concluída — ${ins} conversões atualizadas`);
      query.refetch();
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao sincronizar Shopee"),
  });

  const rows = query.data?.rows ?? [];
  const totals = query.data?.totals;
  const lastSyncAt = query.data?.lastSyncAt;

  const statusBreakdown = query.data?.statusBreakdown ?? [];
  const topProducts = query.data?.topProducts ?? [];

  const filteredRows = useMemo(() => {
    if (!tableFilter.trim()) return rows;
    const q = tableFilter.toLowerCase();

    return rows.filter(
      (o) =>
        o.product_name.toLowerCase().includes(q) ||
        (o.store_name ?? "").toLowerCase().includes(q) ||
        o.order_id.toLowerCase().includes(q),
    );
  }, [rows, tableFilter]);

  const handleExportCsv = () => {
    if (filteredRows.length === 0) {
      toast.error("Nada para exportar com os filtros atuais.");
      return;
    }
    downloadConversionsCsv(filteredRows);
    toast.success(`${filteredRows.length} linhas exportadas para CSV`);
  };

  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased lg:flex">
      <AppSidebar />

      <div className="flex-1 lg:min-w-0">
        <main className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-6 sm:px-6 lg:px-8">
          <HeaderBanner />

          <FiltersPanel
            draft={draft}
            onDraftChange={setDraft}
            onApply={() => setApplied(draft)}
            onSync={() => sync.mutate()}
            syncing={sync.isPending}
            lastSyncAt={lastSyncAt ?? null}
            channels={channels}
          />

          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard
              label="Comissão Total"
              value={currency(totals?.commissionTotal ?? 0)}
              accent="orange"
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <KpiCard
              label="Comissão Líquida"
              value={currency(totals?.commissionNet ?? 0)}
              accent="green"
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <KpiCard
              label="Pedidos"
              value={String(totals?.orders ?? 0)}
              accent="blue"
              icon={<ShoppingBag className="h-4 w-4" />}
            />
            <KpiCard
              label="Itens"
              value={String(totals?.items ?? 0)}
              accent="violet"
              icon={<Package className="h-4 w-4" />}
            />
            <KpiCard
              label="Faturamento"
              value={currency(totals?.revenue ?? 0)}
              accent="teal"
              icon={<BarChart3 className="h-4 w-4" />}
            />
            <KpiCard
              label="Completos"
              value={String(totals?.completed ?? 0)}
              accent="emerald"
              icon={<Sparkles className="h-4 w-4" />}
            />
          </section>

          <ChartsSection statusBreakdown={statusBreakdown} topProducts={topProducts} loading={query.isLoading} />



          <OrdersTable
            orders={filteredRows}
            totalCount={rows.length}
            tableFilter={tableFilter}
            onTableFilterChange={setTableFilter}
            loading={query.isLoading}
            onExportCsv={handleExportCsv}
          />
        </main>
      </div>
    </div>
  );
}

/* ---------------- Banner ---------------- */

function HeaderBanner() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[oklch(0.68_0.19_35)] via-[oklch(0.65_0.22_30)] to-[oklch(0.58_0.22_25)] p-6 text-white shadow-[0_18px_50px_-24px_oklch(0.6_0.22_28/0.7)]">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-[oklch(0.9_0.15_75)]/20 blur-3xl" />

      <div className="relative flex items-center gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15 shadow-inner backdrop-blur">
          <ShoppingBag className="h-7 w-7" strokeWidth={2.4} />
        </div>
        <div className="min-w-0">
          <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            Shopee Analytics
          </div>
          <h1 className="font-display text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
            Relatórios Shopee
          </h1>
          <p className="mt-1 text-sm text-white/85">
            Acompanhe suas conversões, comissões e vendas.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Filters ---------------- */

function FiltersPanel({
  draft,
  onDraftChange,
  onApply,
  onSync,
  syncing,
  lastSyncAt,
  channels,
}: {
  draft: DraftFilters;
  onDraftChange: (d: DraftFilters) => void;
  onApply: () => void;
  onSync: () => void;
  syncing: boolean;
  lastSyncAt: string | null;
  channels: ChannelDTO[];
}) {
  const set = <K extends keyof DraftFilters>(k: K, v: DraftFilters[K]) =>
    onDraftChange({ ...draft, [k]: v });

  return (
    <section className="mt-6 rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <Filter className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-sm font-semibold tracking-tight">
              Filtros avançados
            </h2>
            <p className="text-xs text-muted-foreground">
              Refine os resultados por período, status ou produto.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[oklch(0.78_0.14_75)]/30 bg-[oklch(0.98_0.05_80)] px-2.5 py-1 text-[11px] font-medium text-[oklch(0.5_0.14_60)]">
          <Info className="h-3 w-3" />
          {lastSyncAt
            ? `📦 Última sincronização: ${fmtDate(lastSyncAt)}`
            : "📦 Nenhuma sincronização ainda"}
        </span>
      </div>

      {/* Row 1 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Field label="Data Início" icon={<Calendar className="h-3.5 w-3.5" />}>
          <Input
            type="date"
            value={draft.dateFrom}
            onChange={(e) => set("dateFrom", e.target.value)}
            className="h-10"
          />
        </Field>
        <Field label="Data Fim" icon={<Calendar className="h-3.5 w-3.5" />}>
          <Input
            type="date"
            value={draft.dateTo}
            onChange={(e) => set("dateTo", e.target.value)}
            className="h-10"
          />
        </Field>
        <Field label="Status do Pedido">
          <Select value={draft.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="PENDENTE">Pendente</SelectItem>
              <SelectItem value="COMPLETO">Completo</SelectItem>
              <SelectItem value="CANCELADO">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Tipo de Comprador" icon={<User className="h-3.5 w-3.5" />}>
          <Select value={draft.buyer} onValueChange={(v) => set("buyer", v)}>
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="NEW">Novo</SelectItem>
              <SelectItem value="EXISTING">Existente</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Dispositivo" icon={<Smartphone className="h-3.5 w-3.5" />}>
          <Select value={draft.device} onValueChange={(v) => set("device", v)}>
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="APP">APP</SelectItem>
              <SelectItem value="WEB">WEB</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="flex items-end">
          <Button
            onClick={onApply}
            className="h-10 w-full rounded-lg bg-[oklch(0.65_0.22_30)] text-white shadow-sm hover:bg-[oklch(0.6_0.23_28)]"
          >
            <Search className="mr-1.5 h-4 w-4" />
            Buscar
          </Button>
        </div>
      </div>

      {/* Row 2 */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Field label="Canal / Grupo" icon={<Filter className="h-3.5 w-3.5" />}>
          <Select value={draft.channelId} onValueChange={(v) => set("channelId", v)}>
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {channels.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Plataforma" icon={<ShoppingBag className="h-3.5 w-3.5" />}>
          <Select value={draft.platform} onValueChange={(v) => set("platform", v)}>
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="shopee">Shopee</SelectItem>
              <SelectItem value="mercadolivre">Mercado Livre</SelectItem>
              <SelectItem value="amazon">Amazon</SelectItem>
              <SelectItem value="aliexpress">AliExpress</SelectItem>
              <SelectItem value="magalu">Magalu</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Nome da Loja" icon={<Store className="h-3.5 w-3.5" />}>
          <Input
            value={draft.store}
            onChange={(e) => set("store", e.target.value)}
            placeholder="Ex: Fit Wear Store"
            className="h-10"
          />
        </Field>
        <Field label="Nome do Produto" icon={<Package className="h-3.5 w-3.5" />}>
          <Input
            value={draft.product}
            onChange={(e) => set("product", e.target.value)}
            placeholder="Buscar produto..."
            className="h-10"
          />
        </Field>
        <Field label="ID do Pedido">
          <Input
            value={draft.orderId}
            onChange={(e) => set("orderId", e.target.value)}
            placeholder="ORD-..."
            className="h-10 font-mono text-xs"
          />
        </Field>
        <Field label="Itens por página">
          <Select value={draft.pageSize} onValueChange={(v) => set("pageSize", v)}>
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="200">200</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="mt-3 flex justify-end">
        <Button
          variant="outline"
          onClick={onSync}
          disabled={syncing}
          className="h-10 rounded-lg border-border/70"
        >
          <RefreshCcw className={cn("mr-1.5 h-4 w-4", syncing && "animate-spin")} />
          {syncing ? "Sincronizando..." : "Atualizar dados"}
        </Button>
      </div>
    </section>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </Label>
      {children}
    </div>
  );
}

/* ---------------- KPIs ---------------- */

const KPI_ACCENTS = {
  orange: {
    bg: "from-[oklch(0.98_0.04_60)] to-[oklch(0.96_0.06_50)]",
    ring: "ring-[oklch(0.85_0.15_55)]/30",
    icon: "bg-[oklch(0.68_0.19_35)] text-white",
    value: "text-[oklch(0.55_0.2_35)]",
  },
  green: {
    bg: "from-[oklch(0.98_0.04_150)] to-[oklch(0.96_0.06_150)]",
    ring: "ring-[oklch(0.8_0.16_150)]/30",
    icon: "bg-[oklch(0.65_0.18_150)] text-white",
    value: "text-[oklch(0.5_0.18_150)]",
  },
  blue: {
    bg: "from-[oklch(0.98_0.03_240)] to-[oklch(0.96_0.05_245)]",
    ring: "ring-[oklch(0.78_0.15_245)]/30",
    icon: "bg-[oklch(0.62_0.19_256)] text-white",
    value: "text-[oklch(0.5_0.18_256)]",
  },
  violet: {
    bg: "from-[oklch(0.98_0.03_290)] to-[oklch(0.96_0.05_290)]",
    ring: "ring-[oklch(0.78_0.15_295)]/30",
    icon: "bg-[oklch(0.62_0.2_295)] text-white",
    value: "text-[oklch(0.5_0.19_295)]",
  },
  teal: {
    bg: "from-[oklch(0.98_0.03_195)] to-[oklch(0.96_0.05_195)]",
    ring: "ring-[oklch(0.78_0.14_195)]/30",
    icon: "bg-[oklch(0.62_0.14_195)] text-white",
    value: "text-[oklch(0.5_0.14_195)]",
  },
  emerald: {
    bg: "from-[oklch(0.98_0.04_165)] to-[oklch(0.96_0.06_165)]",
    ring: "ring-[oklch(0.8_0.15_165)]/30",
    icon: "bg-[oklch(0.6_0.16_165)] text-white",
    value: "text-[oklch(0.48_0.16_165)]",
  },
} as const;

function KpiCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: keyof typeof KPI_ACCENTS;
}) {
  const a = KPI_ACCENTS[accent];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-20px_rgba(15,23,42,0.15)]",
        a.bg,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <span className={cn("grid h-7 w-7 place-items-center rounded-lg shadow-sm", a.icon)}>
          {icon}
        </span>
      </div>
      <p className={cn("mt-2 font-display text-2xl font-bold tracking-tight tabular-nums", a.value)}>
        {value}
      </p>
    </div>
  );
}

/* ---------------- Table ---------------- */

function OrdersTable({
  orders,
  totalCount,
  tableFilter,
  onTableFilterChange,
  loading,
  onExportCsv,
}: {
  orders: ConversionRow[];
  totalCount: number;
  tableFilter: string;
  onTableFilterChange: (v: string) => void;
  loading: boolean;
  onExportCsv: () => void;
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <Package className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight">
              Detalhes dos Itens
            </h2>
            <p className="text-xs text-muted-foreground">
              {loading ? "Carregando..." : `${orders.length} item(ns) encontrados`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={tableFilter}
              onChange={(e) => onTableFilterChange(e.target.value)}
              placeholder="Filtrar na tabela"
              className="h-9 w-56 rounded-lg pl-9 text-sm"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onExportCsv}
            className="h-9 rounded-lg border-[oklch(0.65_0.18_150)]/30 bg-[oklch(0.65_0.18_150)]/8 text-[oklch(0.4_0.16_150)] hover:bg-[oklch(0.65_0.18_150)]/15"
          >
            <Download className="mr-1.5 h-4 w-4" />
            CSV
          </Button>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">Produto</th>
              <th className="px-3 py-3">Loja</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3 text-right">Valor</th>
              <th className="px-3 py-3 text-right">Comissão</th>
              <th className="px-3 py-3 text-center">Qtd</th>
              <th className="px-3 py-3">Comprador</th>
              <th className="px-3 py-3">Disp.</th>
              <th className="px-3 py-3">Data</th>
              <th className="px-4 py-3">Categoria</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && !loading && (
              <tr>
                <td colSpan={10} className="px-4 py-16 text-center text-sm text-muted-foreground">
                  Nenhuma conversão encontrada para os filtros selecionados.
                </td>
              </tr>
            )}
            {orders.map((o, i) => (
              <tr
                key={o.id}
                className={cn(
                  "border-b border-border/50 transition-colors hover:bg-muted/30",
                  i % 2 === 1 && "bg-muted/15",
                )}
              >
                <td className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <img
                      src={
                        o.product_image ||
                        "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=120&h=120&fit=crop"
                      }
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-lg border border-border/60 object-cover"
                    />
                    <div className="min-w-0 max-w-[280px]">
                      <p className="line-clamp-2 text-[13px] font-medium leading-tight text-foreground">
                        {o.product_name}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                        {o.product_id && (
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                            {o.product_id}
                          </span>
                        )}
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                          {o.order_id}
                        </span>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span className="text-[13px] font-medium text-foreground">
                    {o.store_name ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <StatusBadge status={(o.status as OrderStatus) ?? "PENDENTE"} />
                </td>
                <td className="px-3 py-3 text-right font-mono text-[13px] font-medium tabular-nums text-foreground">
                  {currency(o.value)}
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="flex flex-col items-end">
                    <span className="font-mono text-[13px] font-bold tabular-nums text-[oklch(0.5_0.18_150)]">
                      {currency(o.commission)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {Number(o.commission_pct) || 0}% comissão
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3 text-center font-mono text-[13px] font-medium tabular-nums">
                  {o.qty}
                </td>
                <td className="px-3 py-3">
                  <BuyerBadge type={(o.buyer_type as BuyerType) ?? "NEW"} />
                </td>
                <td className="px-3 py-3">
                  <span className="inline-flex items-center gap-1 rounded-md bg-[oklch(0.95_0.02_260)] px-1.5 py-0.5 text-[10px] font-bold text-[oklch(0.4_0.15_260)]">
                    <Smartphone className="h-2.5 w-2.5" />
                    {o.device}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-[12px] text-muted-foreground">
                  {fmtDate(o.order_date)}
                </td>
                <td className="max-w-[240px] px-4 py-3 text-[11.5px] text-muted-foreground">
                  <span className="line-clamp-2">{o.category ?? "—"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-muted/25 px-5 py-3 text-xs text-muted-foreground">
        <p>
          Mostrando{" "}
          <span className="font-semibold text-foreground">{orders.length}</span> de{" "}
          <span className="font-semibold text-foreground">{totalCount}</span> resultados
        </p>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-7 rounded-md px-2 text-xs">
            Anterior
          </Button>
          <Button size="sm" className="h-7 rounded-md px-3 text-xs">
            1
          </Button>
          <Button variant="outline" size="sm" className="h-7 rounded-md px-2 text-xs">
            Próximo
          </Button>
        </div>
      </footer>
    </section>
  );
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const map = {
    PENDENTE: "bg-[oklch(0.95_0.09_75)] text-[oklch(0.45_0.16_60)] ring-[oklch(0.78_0.14_65)]/40",
    COMPLETO: "bg-[oklch(0.95_0.08_150)] text-[oklch(0.4_0.16_150)] ring-[oklch(0.75_0.16_150)]/40",
    CANCELADO: "bg-[oklch(0.95_0.06_25)] text-[oklch(0.5_0.2_25)] ring-[oklch(0.75_0.18_25)]/40",
  } as const;
  const cls = map[status] ?? map.PENDENTE;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1",
        cls,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

function BuyerBadge({ type }: { type: BuyerType }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        type === "NEW"
          ? "bg-[oklch(0.95_0.08_150)] text-[oklch(0.4_0.16_150)]"
          : "bg-[oklch(0.94_0.02_260)] text-[oklch(0.4_0.15_260)]",
      )}
    >
      {type}
    </span>
  );
}

/* ---------------- Charts ---------------- */

const STATUS_COLORS: Record<string, string> = {
  COMPLETO: "oklch(0.65 0.18 150)",
  PENDENTE: "oklch(0.72 0.18 60)",
  CANCELADO: "oklch(0.62 0.22 25)",
  NAO_PAGO: "oklch(0.55 0.02 260)",
};
const STATUS_LABEL: Record<string, string> = {
  COMPLETO: "Completo",
  PENDENTE: "Pendente",
  CANCELADO: "Cancelado",
  NAO_PAGO: "Não Pago",
};

function ChartsSection({
  statusBreakdown,
  topProducts,
  loading,
}: {
  statusBreakdown: { status: string; count: number }[];
  topProducts: { product: string; commission: number }[];
  loading: boolean;
}) {
  const donutData = useMemo(
    () =>
      statusBreakdown.map((s) => ({
        name: STATUS_LABEL[s.status] ?? s.status,
        value: s.count,
        fill: STATUS_COLORS[s.status] ?? "oklch(0.6 0.05 260)",
      })),
    [statusBreakdown],
  );

  const totalCount = donutData.reduce((a, b) => a + b.value, 0);

  const barData = useMemo(
    () =>
      topProducts.slice(0, 5).map((p) => ({
        name: p.product.length > 26 ? p.product.slice(0, 24) + "…" : p.product,
        full: p.product,
        // Aproximação visual do split Shopee vs Seller (25% / 75%) enquanto o
        // schema ainda não separa; substituir quando o sync trouxer os campos.
        shopee: Number((p.commission * 0.25).toFixed(2)),
        seller: Number((p.commission * 0.75).toFixed(2)),
        total: Number(p.commission.toFixed(2)),
      })),
    [topProducts],
  );

  return (
    <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Donut */}
      <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <header className="mb-4 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <PieChartIcon className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight">Status dos Pedidos</h2>
            <p className="text-xs text-muted-foreground">
              {loading ? "Carregando..." : `${totalCount} pedido(s) no período`}
            </p>
          </div>
        </header>

        {donutData.length === 0 ? (
          <EmptyChart />
        ) : (
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="h-[220px] w-full max-w-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                  >
                    {donutData.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid hsl(var(--border))",
                      fontSize: 12,
                    }}
                    formatter={(v: number, n) => [`${v} pedido(s)`, n]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="grid flex-1 grid-cols-2 gap-2 text-[12px] sm:grid-cols-1">
              {donutData.map((d) => {
                const pct = totalCount > 0 ? Math.round((d.value / totalCount) * 100) : 0;
                return (
                  <li key={d.name} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.fill }} />
                      <span className="truncate font-medium text-foreground">{d.name}</span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {d.value} · {pct}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Bar */}
      <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <header className="mb-4 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <BarChart3 className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight">Comissões por Item</h2>
            <p className="text-xs text-muted-foreground">Top 5 produtos por comissão gerada</p>
          </div>
          <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[oklch(0.65_0.22_25)]" />
              Shopee
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[oklch(0.72_0.18_60)]" />
              Seller
            </span>
          </div>
        </header>

        {barData.length === 0 ? (
          <EmptyChart />
        ) : (
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
                <XAxis
                  type="number"
                  tickFormatter={(v) => `R$${v}`}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid hsl(var(--border))",
                    fontSize: 12,
                  }}
                  formatter={(v: number, n) => [currency(v), n === "shopee" ? "Shopee" : "Seller"]}
                  labelFormatter={(_, p) => (p?.[0]?.payload as { full?: string })?.full ?? ""}
                />
                <Bar dataKey="shopee" stackId="c" fill="oklch(0.65 0.22 25)" radius={[0, 0, 0, 4]} />
                <Bar dataKey="seller" stackId="c" fill="oklch(0.72 0.18 60)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyChart() {
  return (
    <div className="grid h-[220px] place-items-center rounded-xl border border-dashed border-border/70 bg-muted/20 text-xs text-muted-foreground">
      Sem dados para o período selecionado
    </div>
  );
}
