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
  const { evolutionJson } = await import("@/modules/whatsapp/evolution/client.server");
  return evolutionJson<any>(path, init);
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

  const lojas: string[] = Array.isArray(cfg.lojas_ativas) ? cfg.lojas_ativas : [];
  if (lojas.length === 0) {
    await admin.from("automation_configs").update({
      status: "error",
      last_error: "Nenhuma loja selecionada",
      next_run_at: new Date(Date.now() + (cfg.intervalo_min ?? 15) * 60_000).toISOString(),
    }).eq("id", cfg.id);
    return;
  }

  // Escolhe o próximo produto disponível: pertence às lojas ativas do usuário,
  // está marcado como 'active' e ainda não está registrado em automation_group_sends.
  // Antes de retornar, valida o produto em tempo real (link + imagem).
  // Se a validação falhar, atualiza o status no banco e tenta o próximo.
  const { validateProduct, persistValidation } = await import(
    "@/modules/products/validation/validate.server"
  );

  const ANTI_REPEAT_HOURS = 24;

  async function pickNext(): Promise<any | null> {
    const { data: sent } = await admin
      .from("automation_group_sends")
      .select("product_id")
      .eq("config_id", cfg.id);
    const excluded = new Set((sent ?? []).map((r: any) => r.product_id).filter(Boolean));

    // Proteção anti-repetição real (24h): exclui qualquer produto já enviado
    // com sucesso para este mesmo config nas últimas 24h.
    const since = new Date(Date.now() - ANTI_REPEAT_HOURS * 3600_000).toISOString();
    const { data: recent } = await admin
      .from("whatsapp_campaign_history")
      .select("product_id")
      .eq("config_id", cfg.id)
      .eq("status", "sent")
      .gte("sent_at", since);
    for (const r of recent ?? []) {
      if (r?.product_id) excluded.add(r.product_id);
    }

    // Busca um lote de candidatos aleatorizados e valida em ordem.
    let q = admin
      .from("products")
      .select("*")
      .eq("user_id", cfg.user_id)
      .eq("channel_id", cfg.channel_id)
      .in("platform", lojas)
      .eq("availability", "active")
      .not("affiliate_link", "is", null)
      .order("last_validated_at", { ascending: true, nullsFirst: true })
      .limit(30);

    if (excluded.size > 0) {
      q = q.not("id", "in", `(${Array.from(excluded).join(",")})`);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    // Ordem aleatória: embaralha o lote antes de validar.
    const shuffled = [...(data ?? [])].sort(() => Math.random() - 0.5);
    for (const cand of shuffled) {
      const result = await validateProduct(cand);
      if (result.availability === "active") {
        await persistValidation(admin, cand.id, cfg.channel_id, result);
        return cand;
      }
      await persistValidation(admin, cand.id, cfg.channel_id, result);
      if (result.availability !== "error") {
        await admin.from("automation_group_sends").upsert({
          user_id: cfg.user_id,
          config_id: cfg.id,
          product_id: cand.id,
        }, { onConflict: "config_id,product_id" });
      }
    }
    return null;
  }

  let product = await pickNext();

  // Fim do ciclo:
  // - Loop ON  → limpa histórico do ciclo e reinicia.
  // - Loop OFF → encerra a automação como 'done' preservando last_sent_at
  //              e last_product_name para o painel continuar exibindo.
  if (!product) {
    if (!cfg.post_loop) {
      await admin.from("automation_configs").update({
        status: "done",
        next_run_at: null,
        last_error: null,
      }).eq("id", cfg.id);
      return;
    }
    await admin.from("automation_group_sends").delete().eq("config_id", cfg.id);
    product = await pickNext();
    if (!product) {
      await admin.from("automation_configs").update({
        status: "error",
        last_error: "Nenhum produto ativo/válido nas lojas selecionadas",
        next_run_at: new Date(Date.now() + cfg.intervalo_min * 60_000).toISOString(),
      }).eq("id", cfg.id);
      return;
    }
  }

  // Localiza a instância WhatsApp que enviará os posts.
  // Se `cfg.instance_id` estiver definido, usa aquela instância específica;
  // caso contrário cai para a instância padrão DIVULGA LINKS.
  let inst: { id: string; instance_name: string } | null = null;
  if (cfg.instance_id) {
    const { data: row } = await admin
      .from("whatsapp_instances")
      .select("id, instance_name")
      .eq("user_id", cfg.user_id)
      .eq("id", cfg.instance_id)
      .maybeSingle();
    if (row) inst = row as any;
  }
  if (!inst) {
    const { data: row } = await admin
      .from("whatsapp_instances")
      .select("id, instance_name")
      .eq("user_id", cfg.user_id)
      .eq("instance_name", DEFAULT_INSTANCE)
      .maybeSingle();
    if (row) inst = row as any;
  }

  const instanceName = inst?.instance_name ?? DEFAULT_INSTANCE;

  let groups: Array<{ group_jid: string; group_name: string | null }> = [];
  if (cfg.group_id) {
    groups = [{ group_jid: cfg.group_id, group_name: cfg.group_name ?? null }];
  } else if (inst) {
    const { data: gsel } = await admin
      .from("whatsapp_group_selections")
      .select("group_jid, group_name")
      .eq("user_id", cfg.user_id)
      .eq("instance_id", inst.id)
      .eq("channel_id", cfg.channel_id);
    groups = gsel ?? [];
  }

  if (groups.length === 0) {
    await admin.from("automation_configs").update({
      status: "error",
      last_error: `Nenhum grupo selecionado para ${instanceName}`,
      next_run_at: new Date(Date.now() + cfg.intervalo_min * 60_000).toISOString(),
    }).eq("id", cfg.id);
    return;
  }

  // Valida conexão
  let state = "";
  try {
    state = await connectionState(instanceName);
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
      product_id: product.id,
      product_name: product.title,
      store: product.platform,
      instance_name: instanceName,
      media_url: product.image_url,
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

  // Renderiza legenda
  const { loadLayoutFor, resolveHeader } = await import("@/modules/posts/layout.functions");
  const { renderPost } = await import("@/modules/posts/render");
  const { loadSiteConfigByChannel, wrapLinkWithSite } = await import("@/modules/site/site-link");
  const layout = await loadLayoutFor(admin, cfg.user_id, cfg.channel_id);

  // Anti-repetição de cabeçalho: últimos 5 usados neste config.
  const { data: recent } = await admin
    .from("whatsapp_campaign_history")
    .select("caption")
    .eq("config_id", cfg.id)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(5);
  const recentHeaders = (recent ?? [])
    .map((r: any) => String(r.caption ?? "").split("\n")[0].trim())
    .filter(Boolean);
  const chosenHeader = await resolveHeader(admin, cfg.user_id, layout, recentHeaders);
  const effectiveLayout = { ...layout, header: chosenHeader };

  const siteCfg = cfg.channel_id
    ? await loadSiteConfigByChannel(admin as never, cfg.channel_id)
    : null;
  const wrappedLink = wrapLinkWithSite(product.affiliate_link ?? product.raw_link, siteCfg);
  const productDetail = {
    title: product.title,
    description: null,
    price: product.promo_price,
    price_original: product.original_price,
    vendas: product.sales,
    link: wrappedLink,
    image: product.image_url,
    store: product.store_name ?? product.platform ?? null,
    category: product.category ?? null,
  };
  const caption = renderPost(effectiveLayout, productDetail, "whatsapp");


  let anySent = false;
  for (const g of groups) {
    let ok = true;
    let err: string | null = null;
    try {
      if (!productDetail.image) throw new Error("Produto sem imagem");
      await sendMedia(DEFAULT_INSTANCE, g.group_jid, productDetail.image, caption);
      await new Promise((r) => setTimeout(r, 800));
      anySent = true;
    } catch (e) {
      ok = false;
      err = e instanceof Error ? e.message : String(e);
    }
    await admin.from("whatsapp_campaign_history").insert({
      user_id: cfg.user_id,
      config_id: cfg.id,
      product_id: product.id,
      product_name: product.title,
      store: product.platform,
      group_id: g.group_jid,
      group_name: g.group_name,
      instance_name: DEFAULT_INSTANCE,
      media_url: productDetail.image,
      caption,
      status: ok ? "sent" : "failed",
      error_message: err,
    });
  }

  // Marca produto como enviado neste ciclo (impede repetição).
  // Só registra se pelo menos um grupo recebeu com sucesso.
  if (anySent) {
    await admin.from("automation_group_sends").upsert({
      user_id: cfg.user_id,
      config_id: cfg.id,
      product_id: product.id,
    }, { onConflict: "config_id,product_id" });
  }

  await admin.from("automation_configs").update({
    status: "running",
    current_index: (cfg.current_index ?? 0) + 1,
    last_sent_at: new Date().toISOString(),
    last_product_name: product.title,
    last_error: null,
    next_run_at: new Date(Date.now() + cfg.intervalo_min * 60_000).toISOString(),
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
