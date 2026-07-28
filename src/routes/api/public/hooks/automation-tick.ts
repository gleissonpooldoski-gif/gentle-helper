import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/public-auth.server";
import { isBreakerOpen, recordFailure, recordSuccess } from "@/lib/circuit-breaker.server";
import { formatSalesLabel } from "@/modules/products/sales-label";

/**
 * Log estruturado para rastreamento do worker.
 * Emite JSON single-line para facilitar grep e agregação.
 */
type LogFields = Record<string, unknown>;
function log(event: string, fields: LogFields = {}) {
  try {
    console.log(
      `[AUTOMATION_WORKER] ${JSON.stringify({ event, ts: new Date().toISOString(), ...fields })}`,
    );
  } catch {
    /* ignore serialization errors */
  }
}

/**
 * Classificador centralizado de erros do worker de automação.
 * - `permanent`: config inválida — nunca retentar sozinho (401/403/404/400,
 *   grupo/instância inexistente, token inválido).
 * - `transient`: indisponibilidade temporária — auto-recupera (5xx, 429, 408,
 *   timeout, ECONNRESET/ETIMEDOUT/ENOTFOUND, "fetch failed", tunnel, gateway,
 *   circuit breaker aberto).
 *
 * Único ponto de verdade — não replicar regex em outros lugares do worker.
 */
type ErrorClass = "permanent" | "transient";
function classifyAutomationError(err: unknown): ErrorClass {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const lower = msg.toLowerCase();
  if (
    /\b(400|401|403|404)\b/.test(msg) ||
    lower.includes("group not found") ||
    lower.includes("grupo não encontrado") ||
    lower.includes("grupo removido") ||
    lower.includes("instance not found") ||
    lower.includes("instância não encontrada") ||
    lower.includes("token inválido") ||
    lower.includes("invalid token")
  ) {
    return "permanent";
  }
  if (
    /\b(408|429|5\d\d)\b/.test(msg) ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("etimedout") ||
    lower.includes("econnreset") ||
    lower.includes("connection reset") ||
    lower.includes("enotfound") ||
    lower.includes("fetch failed") ||
    lower.includes("network error") ||
    lower.includes("tunnel") ||
    lower.includes("gateway") ||
    lower.includes("circuit breaker") ||
    lower.includes("temporariamente indisponível") ||
    lower.includes("temporariamente indisponivel")
  ) {
    return "transient";
  }
  // Default seguro: tratar desconhecido como transitório para não travar
  // config em `error` por erro de rede não-catalogado.
  return "transient";
}
// Alias retrocompatível — todo o worker deve preferir classifyAutomationError.
const classifyError = classifyAutomationError;



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

/**
 * Envio single-shot para a Evolution API.
 *
 * LOTE 8 — RETRY REMOVIDO INTENCIONALMENTE.
 *
 * O endpoint /message/sendMedia NÃO é idempotente do lado da Evolution/WhatsApp:
 * se a mensagem foi entregue mas a resposta HTTP falhou (timeout, 5xx, corte
 * de conexão, tunnel Cloudflare), uma nova tentativa gera envio duplicado
 * para o usuário final. Como não há como distinguir "não chegou" de
 * "chegou mas ack falhou", a única política fail-safe é NÃO retentar.
 *
 * O produto permanece reservado em `automation_group_sends` (feito antes
 * desta chamada) — portanto nunca será re-enviado nem neste tick nem em
 * ticks futuros. Falhas transitórias são tratadas como "envio possivelmente
 * concluído" e a próxima execução simplesmente escolhe outro produto.
 */
async function sendMediaOnce(
  instance: string,
  jid: string,
  mediaUrl: string,
  caption: string,
  ctx: LogFields,
): Promise<{ attempts: 1; durationMs: number }> {
  const started = Date.now();
  try {
    await evolutionFetch(`/message/sendMedia/${encodeURIComponent(instance)}`, {
      method: "POST",
      body: JSON.stringify({
        number: jid,
        mediatype: "image",
        media: mediaUrl,
        caption,
      }),
    });
    return { attempts: 1, durationMs: Date.now() - started };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("SEND_NO_RETRY", { ...ctx, reason: "idempotency_guard", error: msg });
    throw e;
  }
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
  // LOTE 26 — este hook NÃO altera mais `availability`. A responsabilidade
  // por manter o status atualizado é exclusiva do cron `products-validate`.
  // Aqui apenas lemos o snapshot mais recente e confiamos no filtro
  // `availability='active'` da query abaixo.

  const ANTI_REPEAT_HOURS = 24;

  async function pickNext(): Promise<any | null> {
    // Inventário obrigatório por canal + grupo. Legados sem grupo ficam
    // pendentes e jamais são enviados automaticamente.
    if (!cfg.group_id) return null;

    // Sends do ciclo + histórico anti-repetição em paralelo (1 round-trip).
    const since = new Date(Date.now() - ANTI_REPEAT_HOURS * 3600_000).toISOString();
    const [sentRes, recentRes] = await Promise.all([
      admin.from("automation_group_sends").select("product_id").eq("config_id", cfg.id),
      admin
        .from("whatsapp_campaign_history")
        .select("product_id")
        .eq("config_id", cfg.id)
        .eq("status", "sent")
        .gte("sent_at", since),
    ]);
    const excluded = new Set<string>();
    for (const r of sentRes.data ?? []) if (r?.product_id) excluded.add(r.product_id);
    for (const r of recentRes.data ?? []) if (r?.product_id) excluded.add(r.product_id);

    // Seleção enxuta (colunas usadas) ordenada pelos menos-validados.
    let q = admin
      .from("products")
      .select(
        "id, title, platform, promo_price, original_price, image_url, affiliate_link, raw_link, sales, sales_label, sales_recent, sales_historical, sales_source, price_quality, price_quality_reason, store_name, category, source_group_jid, source_group_name, availability, last_validated_at",
      )
      .eq("user_id", cfg.user_id)
      .eq("channel_id", cfg.channel_id)
      .eq("source_group_jid", cfg.group_id)
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
    const shuffled = [...(data ?? [])].sort(() => Math.random() - 0.5);
    // LOTE 26 — sem validação síncrona. Todos os candidatos já são 'active'
    // (garantido pelo filtro acima). O cron `products-validate` mantém isso
    // atualizado. Retorna o primeiro candidato disponível.
    return shuffled[0] ?? null;
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
      // Estoque momentaneamente vazio: transitório — aguarda novos produtos.
      await admin.from("automation_configs").update({
        status: "waiting",
        last_error: cfg.group_id
          ? "Nenhum produto capturado deste grupo disponível para envio"
          : "Nenhum produto ativo/válido nas lojas selecionadas",
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
    // Validação obrigatória de posse: o grupo destino precisa estar vinculado
    // à instância desta config. Se não estiver, bloqueia envio.
    if (inst) {
      const { data: owns } = await admin
        .from("whatsapp_group_selections")
        .select("group_jid, group_name")
        .eq("user_id", cfg.user_id)
        .eq("instance_id", inst.id)
        .eq("channel_id", cfg.channel_id)
        .eq("group_jid", cfg.group_id)
        .maybeSingle();
      if (!owns) {
        await admin.from("whatsapp_campaign_history").insert({
          user_id: cfg.user_id,
          config_id: cfg.id,
          product_id: product.id,
          product_name: product.title,
          store: product.platform,
          group_id: cfg.group_id,
          group_name: cfg.group_name,
          instance_name: instanceName,
          status: "failed",
          error_message: `Grupo bloqueado: ${cfg.group_id} não pertence à instância ${instanceName}`,
        });
        await admin.from("automation_configs").update({
          status: "error",
          last_error: `Grupo não pertence à instância ${instanceName}`,
          next_run_at: new Date(Date.now() + cfg.intervalo_min * 60_000).toISOString(),
        }).eq("id", cfg.id);
        return;
      }
    }
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
    const message = err instanceof Error ? err.message : String(err);
    const cls = classifyAutomationError(err);
    // Transitórios (Evolution 5xx, timeout, ECONNRESET, tunnel, etc.) marcam
    // a config como `waiting` e adiam a próxima execução — auto-recupera.
    // Permanentes (401/403/404, instância/grupo inexistente) marcam `error`.
    await admin.from("automation_configs").update({
      status: cls === "transient" ? "waiting" : "error",
      last_error: message,
      next_run_at: new Date(Date.now() + Math.max(1, Math.min(cfg.intervalo_min, 2)) * 60_000).toISOString(),
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
    // WhatsApp offline é transitório: aguarda reconexão.
    await admin.from("automation_configs").update({
      status: "waiting",
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
  const siteCfg = cfg.channel_id
    ? await loadSiteConfigByChannel(admin as never, cfg.channel_id)
    : null;
  const wrappedLink = wrapLinkWithSite(product.affiliate_link ?? product.raw_link, siteCfg);
  const { resolveProductDisplay } = await import("@/modules/products/display-resolver");
  const display = resolveProductDisplay(product as never);
  // LOTE 18A: hasDiscount vem do resolver (HIGH), nunca de original>promo cru.
  const hasDiscount = display.priceOriginalDisplay != null;
  const chosenHeader = await resolveHeader(admin, cfg.user_id, layout, recentHeaders, { hasDiscount });
  const effectiveLayout = { ...layout, header: chosenHeader };
  try {
    console.log(JSON.stringify({
      event: "PRODUCT_DISPLAY_RESOLVED",
      product_id: product.id,
      platform: product.platform,
      title: product.title,
      sales_source: display.salesSource,
      sales_value: display.salesValue,
      sales_label: display.salesLabel,
      price_quality: display.priceQuality,
      price_quality_reason: display.priceQualityReason,
      price_original_display: display.priceOriginalDisplay,
      discount_pct: display.discountPct,
    }));
  } catch { /* noop */ }
  const productDetail = {
    title: product.title,
    description: null,
    price: display.priceCurrentDisplay ?? product.promo_price,
    price_original: display.priceOriginalDisplay,
    vendas: display.salesLabel || null,
    link: wrappedLink,
    image: product.image_url,
    store: product.store_name ?? product.platform ?? null,
    category: product.category ?? null,
  };
  try {
    console.log("[automation-post-product]", {
      config_id: cfg.id,
      channel_id: cfg.channel_id,
      group_id: groups.map((g) => g.group_jid),
      title: productDetail.title,
      vendas: productDetail.vendas,
      price: productDetail.price,
      price_original: productDetail.price_original,
      header_mode: layout.header_mode,
      chosen_header: chosenHeader,
    });
    console.log("[COMPARE_POST_PIPELINE]", {
      source: "automation",
      title: product.title,
      vendas: productDetail.vendas,
      sales_label: (product as { sales_label?: string | null }).sales_label ?? null,
      sales: product.sales ?? null,
      price: productDetail.price,
      price_original: productDetail.price_original,
      promo_price: product.promo_price ?? null,
      original_price: product.original_price ?? null,
      channel_id: cfg.channel_id,
      group_id: groups.map((g) => g.group_jid),
      config_id: cfg.id,
      header_mode: layout.header_mode,
      header: chosenHeader,
    });
  } catch { /* noop */ }

  const caption = renderPost(effectiveLayout, productDetail, "whatsapp");


  let anySent = false;
  const productSourceJid: string | null = (product as { source_group_jid?: string | null }).source_group_jid ?? null;
  for (const g of groups) {
    // Bloqueio de isolamento: se o produto foi capturado de outro grupo,
    // cancela o envio para este destino e registra o motivo.
    if (productSourceJid && productSourceJid !== g.group_jid) {
      await admin.from("whatsapp_campaign_history").insert({
        user_id: cfg.user_id,
        config_id: cfg.id,
        product_id: product.id,
        product_name: product.title,
        store: product.platform,
        group_id: g.group_jid,
        group_name: g.group_name,
        instance_name: instanceName,
        media_url: productDetail.image,
        caption,
        status: "blocked",
        error_message: `Produto bloqueado: pertence a outro grupo (${(product as { source_group_name?: string | null }).source_group_name ?? productSourceJid})`,
      });
      continue;
    }
    const sendCtx: LogFields = {
      config_id: cfg.id,
      instance_id: cfg.instance_id ?? inst?.id ?? null,
      instance_name: instanceName,
      group_id: g.group_jid,
      product_id: product.id,
      worker_id: (globalThis as { __automation_worker_id?: string }).__automation_worker_id ?? null,
    };
    let ok = true;
    let err: string | null = null;
    let errorClass: ErrorClass | null = null;
    let sendMetrics: { attempts: number; durationMs: number } | null = null;

    // Circuit breaker: consulta antes do envio.
    const breakerInstanceId = inst?.id ?? cfg.instance_id ?? null;
    if (breakerInstanceId && (await isBreakerOpen(breakerInstanceId))) {
      log("CIRCUIT_OPEN", { ...sendCtx });
      ok = false;
      err = "Circuit breaker aberto (instância com falhas consecutivas)";
      errorClass = "transient";
    } else {
      try {
        if (!productDetail.image) throw new Error("Produto sem imagem");
        log("SEND_STARTED", sendCtx);
        console.log("[WHATSAPP_FINAL_CAPTION]", { source: "automation", instance: instanceName, jid: g.group_jid, caption });
        sendMetrics = await sendMedia(instanceName, g.group_jid, productDetail.image, caption, sendCtx);
        log("SEND_SUCCESS", { ...sendCtx, attempts: sendMetrics.attempts, duration_ms: sendMetrics.durationMs });

        if (breakerInstanceId) await recordSuccess(breakerInstanceId).catch(() => undefined);
        await new Promise((r) => setTimeout(r, 800));
        anySent = true;
      } catch (e) {
        ok = false;
        err = e instanceof Error ? e.message : String(e);
        errorClass = classifyError(e);
        log("SEND_FAILED", { ...sendCtx, error_class: errorClass, error: err });

        if (breakerInstanceId && errorClass === "transient") {
          await recordFailure(breakerInstanceId, cfg.user_id, e).catch(() => undefined);
        }

        // Dead-Letter Queue: registra falha para reprocessamento manual.
        try {
          await admin.from("automation_failures").insert({
            user_id: cfg.user_id,
            config_id: cfg.id,
            product_id: product.id,
            group_id: g.group_jid,
            instance_id: cfg.instance_id ?? null,
            error_message: (err ?? "erro desconhecido").slice(0, 500),
            error_code: errorClass === "permanent" ? "permanent_error" : "send_failed",
            attempt_count: sendMetrics?.attempts ?? 1,
            next_retry_at: errorClass === "permanent"
              ? null
              : new Date(Date.now() + 5 * 60_000).toISOString(),
          });
        } catch { /* ignora falha ao gravar DLQ */ }
      }
    }

    await admin.from("whatsapp_campaign_history").insert({
      user_id: cfg.user_id,
      config_id: cfg.id,
      product_id: product.id,
      product_name: product.title,
      store: product.platform,
      group_id: g.group_jid,
      group_name: g.group_name,
      instance_name: instanceName,
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



/**
 * Advisory lock por destino (instance_id, group_id). Se dois workers
 * tentarem processar o mesmo destino simultaneamente, apenas um continua
 * e o outro é dispensado imediatamente (LOCK_SKIPPED). Fallback para
 * lock por config_id quando instance_id/group_id são nulos (legado).
 *
 * Liberação garantida no bloco finally, mesmo em caso de throw, timeout,
 * Evolution offline ou cancelamento. Advisory locks também são liberados
 * automaticamente ao fim da sessão do Postgres.
 */
async function withDestinationLock<T>(
  admin: any,
  cfg: { id: string; instance_id: string | null; group_id: string | null },
  ctx: LogFields,
  fn: () => Promise<T>,
): Promise<T | { skipped: true }> {
  const useDestination = cfg.instance_id && cfg.group_id;
  const rpcName = useDestination ? "try_lock_automation_destination" : "try_lock_automation_config";
  const unlockRpc = useDestination ? "unlock_automation_destination" : "unlock_automation_config";
  const args = useDestination
    ? { _instance_id: cfg.instance_id, _group_id: cfg.group_id }
    : { _config_id: cfg.id };

  const { data: acquired, error: lockErr } = await admin.rpc(rpcName, args);
  if (lockErr) {
    // Fallback fail-open apenas se a função não existir (evita travar operação
    // em ambiente parcialmente migrado). Qualquer outro erro é propagado.
    if (String(lockErr.message || "").includes("does not exist")) {
      log("LOCK_MISSING_RPC", { ...ctx, rpc: rpcName });
      return fn();
    }
    throw new Error(`lock: ${lockErr.message}`);
  }
  if (!acquired) {
    log("LOCK_SKIPPED", { ...ctx, reason: "concurrent_worker" });
    return { skipped: true };
  }
  log("LOCK_ACQUIRED", ctx);
  try {
    return await fn();
  } finally {
    try {
      await admin.rpc(unlockRpc, args);
      log("LOCK_RELEASED", ctx);
    } catch (unlockErr) {
      // Liberação best-effort; advisory lock é liberado ao fim da sessão.
      log("LOCK_RELEASE_FAILED", {
        ...ctx,
        error: unlockErr instanceof Error ? unlockErr.message : String(unlockErr),
      });
    }
  }
}

export const Route = createFileRoute("/api/public/hooks/automation-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFail = requireCronSecret(request);
        if (authFail) return authFail;

        // Worker ID único por invocação para correlacionar logs.
        const workerId = crypto.randomUUID();
        (globalThis as { __automation_worker_id?: string }).__automation_worker_id = workerId;
        const startedAt = Date.now();
        log("TICK_STARTED", { worker_id: workerId });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: configs, error } = await supabaseAdmin
          .from("automation_configs")
          .select("*")
          .in("status", ["running", "waiting"]);
        if (error) {
          log("TICK_ERROR", { worker_id: workerId, error: error.message });
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const CONCURRENCY = 5;
        const queue = [...(configs ?? [])];
        const results: Array<{ id: string; ok: boolean; skipped?: boolean; error?: string; duration_ms?: number }> = [];

        async function processOne(cfg: any) {
          const cfgStart = Date.now();
          const ctx: LogFields = {
            worker_id: workerId,
            config_id: cfg.id,
            instance_id: cfg.instance_id,
            group_id: cfg.group_id,
          };
          try {
            const r = await withDestinationLock(supabaseAdmin, cfg, ctx, () =>
              tickOne(supabaseAdmin, cfg),
            );
            const duration = Date.now() - cfgStart;
            if (r && typeof r === "object" && "skipped" in r) {
              results.push({ id: cfg.id, ok: true, skipped: true, duration_ms: duration });
            } else {
              results.push({ id: cfg.id, ok: true, duration_ms: duration });
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const duration = Date.now() - cfgStart;
            const cls = classifyAutomationError(err);
            log("TICK_CONFIG_ERROR", { ...ctx, error: msg, error_class: cls, duration_ms: duration });
            results.push({ id: cfg.id, ok: false, error: msg, duration_ms: duration });
            // Transitório → waiting (auto-recupera). Permanente → error (exige intervenção).
            await supabaseAdmin.from("automation_configs").update({
              status: cls === "transient" ? "waiting" : "error",
              last_error: msg,
              next_run_at: new Date(Date.now() + (cfg.intervalo_min ?? 15) * 60_000).toISOString(),
            }).eq("id", cfg.id);
          }

        }

        const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
          while (queue.length > 0) {
            const cfg = queue.shift();
            if (!cfg) return;
            await processOne(cfg);
          }
        });
        await Promise.all(workers);
        log("TICK_COMPLETED", {
          worker_id: workerId,
          processed: results.length,
          total_duration_ms: Date.now() - startedAt,
        });
        return Response.json({ ok: true, worker_id: workerId, processed: results.length, results });
      },
      GET: async () => Response.json({ ok: true, hint: "POST with x-cron-secret header to trigger" }),
    },
  },
});

