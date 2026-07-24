import { createFileRoute } from "@tanstack/react-router";

/**
 * Worker de automação. Chamado por pg_cron a cada minuto.
 *
 * Para cada config com status='running' ou 'waiting':
 * - se fora da janela [hora_inicio, hora_fim] (America/Sao_Paulo), marca 'waiting'
 *   e agenda next_run_at para próxima abertura de janela.
 * - se dentro e next_run_at <= now(): valida connectionState da instância
 *   DIVULGA LINKS; se open, envia produto atual para cada grupo selecionado
 *   individualmente via /message/sendMedia, grava histórico, avança índice.
 * - se chegou ao fim: loop → volta ao 0; senão marca 'done'.
 */

const DEFAULT_INSTANCE = "DIVULGA LINKS";
const TZ = "America/Sao_Paulo";

function nowInTz(): { hour: number; minute: number; date: Date } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { hour: h, minute: m, date: now };
}

function parseHm(s: string): { h: number; m: number } {
  const [h, m] = String(s).split(":");
  return { h: Number(h) || 0, m: Number(m) || 0 };
}

function isWithinWindow(nowH: number, nowM: number, start: string, end: string): boolean {
  const s = parseHm(start);
  const e = parseHm(end);
  const cur = nowH * 60 + nowM;
  const from = s.h * 60 + s.m;
  const to = e.h * 60 + e.m;
  if (from <= to) return cur >= from && cur <= to;
  // janela cruza meia-noite
  return cur >= from || cur <= to;
}

function nextWindowOpen(start: string): Date {
  // Próxima abertura em UTC (aproximação: -3h fixo de BRT; suficiente p/ agendamento)
  const { h, m } = parseHm(start);
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 3600_000);
  const openBrt = new Date(brt);
  openBrt.setUTCHours(h, m, 0, 0);
  if (openBrt <= brt) openBrt.setUTCDate(openBrt.getUTCDate() + 1);
  return new Date(openBrt.getTime() + 3 * 3600_000);
}

async function evolutionFetch(path: string, init?: RequestInit) {
  const base = (process.env.EVOLUTION_API_URL || "").replace(/\/$/, "");
  const key = process.env.EVOLUTION_API_KEY || "";
  if (!base || !key) throw new Error("Evolution API não configurada");
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* raw */ }
  if (!res.ok) {
    throw new Error(`Evolution ${res.status}: ${text.slice(0, 200)}`);
  }
  return json;
}

async function connectionState(instance: string): Promise<string> {
  const j = await evolutionFetch(`/instance/connectionState/${encodeURIComponent(instance)}`);
  return String(j?.instance?.state ?? j?.state ?? "").toLowerCase();
}

async function sendMedia(instance: string, jid: string, mediaUrl: string, caption: string) {
  return evolutionFetch(`/message/sendMedia/${encodeURIComponent(instance)}`, {
    method: "POST",
    body: JSON.stringify({
      number: jid,
      mediatype: "image",
      media: mediaUrl,
      caption,
    }),
  });
}

async function tickOne(admin: any, cfg: any): Promise<void> {
  const { hour, minute } = nowInTz();
  const inWindow = isWithinWindow(hour, minute, String(cfg.hora_inicio).slice(0, 5), String(cfg.hora_fim).slice(0, 5));

  if (!inWindow) {
    const next = nextWindowOpen(String(cfg.hora_inicio).slice(0, 5)).toISOString();
    await admin.from("automation_configs").update({
      status: "waiting",
      next_run_at: next,
    }).eq("id", cfg.id);
    return;
  }

  if (cfg.next_run_at && new Date(cfg.next_run_at).getTime() > Date.now()) return;

  // Carrega fila
  const { data: queue, error: qErr } = await admin
    .from("automation_queue")
    .select("*")
    .eq("config_id", cfg.id)
    .order("order_index", { ascending: true });
  if (qErr) throw new Error(qErr.message);
  if (!queue || queue.length === 0) {
    await admin.from("automation_configs").update({
      status: "done",
      last_error: "Fila vazia",
      next_run_at: null,
    }).eq("id", cfg.id);
    return;
  }

  const idx = cfg.current_index % queue.length;
  const item = queue[idx];

  // Grupos selecionados para o canal (por instance/channel)
  // Precisamos localizar a instance_id via canal ou por nome padrão.
  // Buscamos instância pelo nome DIVULGA LINKS do usuário.
  const { data: inst } = await admin
    .from("whatsapp_instances")
    .select("id, instance_name")
    .eq("user_id", cfg.user_id)
    .eq("instance_name", DEFAULT_INSTANCE)
    .maybeSingle();

  let groups: Array<{ group_jid: string; group_name: string | null }> = [];
  if (inst) {
    const { data: gsel } = await admin
      .from("whatsapp_group_selections")
      .select("group_jid, group_name")
      .eq("user_id", cfg.user_id)
      .eq("instance_id", inst.id);
    groups = gsel ?? [];
  }

  if (groups.length === 0) {
    await admin.from("automation_configs").update({
      status: "error",
      last_error: "Nenhum grupo selecionado para DIVULGA LINKS",
      next_run_at: new Date(Date.now() + cfg.intervalo_min * 60_000).toISOString(),
    }).eq("id", cfg.id);
    return;
  }

  // Valida conexão
  let state = "";
  try {
    state = await connectionState(DEFAULT_INSTANCE);
  } catch (err) {
    await admin.from("automation_configs").update({
      status: "error",
      last_error: err instanceof Error ? err.message : String(err),
      next_run_at: new Date(Date.now() + cfg.intervalo_min * 60_000).toISOString(),
    }).eq("id", cfg.id);
    return;
  }
  if (state !== "open") {
    await admin.from("whatsapp_campaign_history").insert({
      user_id: cfg.user_id,
      config_id: cfg.id,
      product_id: item.product_id,
      product_name: item.title,
      store: item.store,
      instance_name: DEFAULT_INSTANCE,
      media_url: item.media_url,
      status: "failed",
      error_message: `WhatsApp desconectado (state=${state || "unknown"})`,
    });
    await admin.from("automation_configs").update({
      status: "error",
      last_error: "WhatsApp desconectado",
      next_run_at: new Date(Date.now() + cfg.intervalo_min * 60_000).toISOString(),
    }).eq("id", cfg.id);
    return;
  }

  // Renderiza legenda usando o layout do usuário
  const { loadLayoutFor } = await import("@/modules/posts/layout.functions");
  const { renderPost } = await import("@/modules/posts/render");
  const layout = await loadLayoutFor(admin, cfg.user_id);
  // Recupera dados do produto (para preço, etc.)
  let productDetail: any = { title: item.title, link: item.link, image: item.media_url };
  if (item.product_id) {
    const { data: pr } = await admin
      .from("products")
      .select("*")
      .eq("id", item.product_id)
      .maybeSingle();
    if (pr) {
      productDetail = {
        title: pr.title,
        description: null,
        price: pr.promo_price,
        price_original: pr.original_price,
        vendas: pr.sales,
        link: pr.affiliate_link,
        image: pr.image_url,
      };
    }
  }
  const caption = renderPost(layout, productDetail, "whatsapp");

  // Envia um-a-um
  for (const g of groups) {
    let ok = true;
    let err: string | null = null;
    try {
      if (!productDetail.image) throw new Error("Produto sem imagem");
      await sendMedia(DEFAULT_INSTANCE, g.group_jid, productDetail.image, caption);
      await new Promise((r) => setTimeout(r, 800));
    } catch (e) {
      ok = false;
      err = e instanceof Error ? e.message : String(e);
    }
    await admin.from("whatsapp_campaign_history").insert({
      user_id: cfg.user_id,
      config_id: cfg.id,
      product_id: item.product_id,
      product_name: item.title,
      store: item.store,
      group_id: g.group_jid,
      group_name: g.group_name,
      instance_name: DEFAULT_INSTANCE,
      media_url: productDetail.image,
      caption,
      status: ok ? "sent" : "failed",
      error_message: err,
    });
  }

  // Avança fila
  const nextIndex = idx + 1;
  const done = nextIndex >= queue.length;
  const nextStatus = done && !cfg.post_loop ? "done" : "running";
  const nextCurrent = done ? (cfg.post_loop ? 0 : queue.length) : nextIndex;

  await admin.from("automation_configs").update({
    status: nextStatus,
    current_index: nextCurrent,
    last_sent_at: new Date().toISOString(),
    last_product_name: item.title,
    last_error: null,
    next_run_at: nextStatus === "done"
      ? null
      : new Date(Date.now() + cfg.intervalo_min * 60_000).toISOString(),
  }).eq("id", cfg.id);
}

export const Route = createFileRoute("/api/public/hooks/automation-tick")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: configs, error } = await supabaseAdmin
          .from("automation_configs")
          .select("*")
          .in("status", ["running", "waiting"]);
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const results: Array<{ id: string; ok: boolean; error?: string }> = [];
        for (const cfg of configs ?? []) {
          try {
            await tickOne(supabaseAdmin, cfg);
            results.push({ id: cfg.id, ok: true });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            results.push({ id: cfg.id, ok: false, error: msg });
            await supabaseAdmin.from("automation_configs").update({
              status: "error",
              last_error: msg,
              next_run_at: new Date(Date.now() + (cfg.intervalo_min ?? 15) * 60_000).toISOString(),
            }).eq("id", cfg.id);
          }
        }
        return Response.json({ ok: true, processed: results.length, results });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to trigger" }),
    },
  },
});
