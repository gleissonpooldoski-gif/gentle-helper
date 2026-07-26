import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ReportFilters {
  channelId?: string | null;
  platform?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  status?: string | null;
  buyer?: string | null;
  device?: string | null;
  store?: string | null;
  product?: string | null;
  orderId?: string | null;
  limit?: number;
}

export interface ConversionRow {
  id: string;
  channel_id: string | null;
  platform: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  product_image: string | null;
  store_name: string | null;
  category: string | null;
  status: string;
  value: number;
  commission: number;
  commission_pct: number;
  qty: number;
  buyer_type: string;
  device: string;
  order_date: string;
}

export interface ReportsPayload {
  rows: ConversionRow[];
  totals: {
    commissionTotal: number;
    commissionNet: number;
    orders: number;
    items: number;
    revenue: number;
    completed: number;
  };
  statusBreakdown: { status: string; count: number }[];
  topProducts: { product: string; commission: number }[];
  lastSyncAt: string | null;
}

const sel = (s: string): string => s;

export const listReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ReportFilters) => data ?? {})
  .handler(async ({ data, context }): Promise<ReportsPayload> => {
    const { supabase, userId } = context;
    const limit = Math.min(Math.max(data.limit ?? 200, 1), 1000);

    let q = supabase
      .from("shopee_conversions")
      .select(sel("id, channel_id, platform, order_id, product_id, product_name, product_image, store_name, category, status, value, commission, commission_pct, qty, buyer_type, device, order_date"))
      .eq("user_id", userId)
      .order("order_date", { ascending: false })
      .limit(limit);

    if (data.channelId) q = q.eq("channel_id", data.channelId);
    if (data.platform && data.platform !== "all") q = q.eq("platform", data.platform);
    if (data.dateFrom) q = q.gte("order_date", data.dateFrom);
    if (data.dateTo) q = q.lte("order_date", `${data.dateTo}T23:59:59`);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.buyer && data.buyer !== "all") q = q.eq("buyer_type", data.buyer);
    if (data.device && data.device !== "all") q = q.eq("device", data.device);
    if (data.store) q = q.ilike("store_name", `%${data.store}%`);
    if (data.product) q = q.ilike("product_name", `%${data.product}%`);
    if (data.orderId) q = q.ilike("order_id", `%${data.orderId}%`);

    const { data: rowsRaw, error } = await q.returns<ConversionRow[]>();
    if (error) throw new Error(error.message);
    const rows = rowsRaw ?? [];

    const totals = rows.reduce(
      (acc, r) => {
        const val = Number(r.value) || 0;
        const com = Number(r.commission) || 0;
        acc.revenue += val;
        acc.commissionTotal += com;
        if (r.status !== "CANCELADO") acc.commissionNet += com;
        acc.items += Number(r.qty) || 0;
        if (r.status === "COMPLETO") acc.completed += 1;
        acc.orderSet.add(r.order_id);
        return acc;
      },
      {
        commissionTotal: 0,
        commissionNet: 0,
        revenue: 0,
        items: 0,
        completed: 0,
        orderSet: new Set<string>(),
      },
    );

    const statusMap = new Map<string, number>();
    for (const r of rows) statusMap.set(r.status, (statusMap.get(r.status) ?? 0) + 1);

    const productMap = new Map<string, number>();
    for (const r of rows) {
      productMap.set(r.product_name, (productMap.get(r.product_name) ?? 0) + (Number(r.commission) || 0));
    }
    const topProducts = [...productMap.entries()]
      .map(([product, commission]) => ({ product, commission }))
      .sort((a, b) => b.commission - a.commission)
      .slice(0, 5);

    let lastSyncAt: string | null = null;
    if (data.channelId) {
      const { data: ch } = await supabase
        .from("channels")
        .select(sel("reports_last_sync_at"))
        .eq("id", data.channelId)
        .eq("user_id", userId)
        .maybeSingle();
      lastSyncAt = (ch as { reports_last_sync_at: string | null } | null)?.reports_last_sync_at ?? null;
    } else {
      const { data: last } = await supabase
        .from("shopee_conversions")
        .select(sel("synced_at"))
        .eq("user_id", userId)
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      lastSyncAt = (last as { synced_at: string | null } | null)?.synced_at ?? null;
    }

    return {
      rows,
      totals: {
        commissionTotal: totals.commissionTotal,
        commissionNet: totals.commissionNet,
        orders: totals.orderSet.size,
        items: totals.items,
        revenue: totals.revenue,
        completed: totals.completed,
      },
      statusBreakdown: [...statusMap.entries()].map(([status, count]) => ({ status, count })),
      topProducts,
      lastSyncAt,
    };
  });

/**
 * Sincroniza conversões via Shopee Affiliate Open API v2 (GraphQL assinado).
 * Requer App ID + App Secret salvos em Config Afiliados → Shopee.
 */
export const syncReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { channelId?: string | null }) => data ?? {})
  .handler(async ({ context }) => {
    const { syncShopeeConversions } = await import("./shopee-reports.server");
    const result = await syncShopeeConversions(context.supabase, context.userId);
    await context.supabase
      .from("channels")
      .update({ reports_last_sync_at: new Date().toISOString() })
      .eq("user_id", context.userId);
    return result;
  });
