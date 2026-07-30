/**
 * ETAPA 3 — Reapers genéricos + manutenção da DLQ.
 *
 * Responsabilidade única: recuperar ESTADO preso e higienizar a fila de
 * falhas. Este módulo NUNCA envia mensagem, nunca cria claim e nunca
 * apaga claim ativo — portanto não pode gerar envio duplicado.
 *
 * Regras invioláveis (não tocadas aqui):
 *  - CLAIM atômico em automation_group_sends;
 *  - envio manual;
 *  - integração Evolution;
 *  - automações em funcionamento.
 */

export type ReaperLogEvent =
  | "REAPER_STARTED"
  | "REAPER_DONE"
  | "REAPER_TABLE_FAILED"
  | "ORPHAN_RECOVERED"
  | "DLQ_ITEM_EXPIRED"
  | "RETRY_SCHEDULED"
  | "RETRY_EXHAUSTED";

export function reaperLog(event: ReaperLogEvent, fields: Record<string, unknown> = {}) {
  try {
    console.log(
      "[SYSTEM_REAPER] " +
        JSON.stringify({ event, ts: new Date().toISOString(), ...fields }),
    );
  } catch {
    /* noop */
  }
}

const MIN = 60_000;

export interface OrphanSpec {
  /** Tabela alvo. */
  table: string;
  /** Estados considerados "em andamento". */
  stuckStatuses: string[];
  /** Coluna de tempo usada para medir o abandono. */
  timeColumn: string;
  /** Tempo máximo tolerado no estado em andamento. */
  ttlMs: number;
  /** Estado final seguro (terminal, não reenvia). */
  terminalStatus: string;
  /** Coluna opcional onde gravar o motivo. */
  reasonColumn?: string;
  /** Coluna updated_at, quando existir. */
  touchUpdatedAt?: boolean;
  /** Descrição da política aplicada (vai para o log). */
  policy: string;
}

/**
 * Especificações de recuperação. Todos os estados terminais escolhidos são
 * NÃO-REENVIÁVEIS por definição: nenhum worker lê `failed` para reenviar.
 */
export const ORPHAN_SPECS: OrphanSpec[] = [
  {
    table: "automation_group_sends",
    stuckStatuses: ["processing"],
    timeColumn: "sent_at",
    ttlMs: 10 * MIN,
    terminalStatus: "failed",
    touchUpdatedAt: true,
    policy: "claim_orfao_marcado_failed_sem_reenvio",
  },
  {
    table: "manual_posts",
    stuckStatuses: ["processing", "sending", "queued"],
    timeColumn: "updated_at",
    ttlMs: 30 * MIN,
    terminalStatus: "failed",
    reasonColumn: "last_error",
    touchUpdatedAt: true,
    policy: "post_manual_abandonado_marcado_failed",
  },
  {
    table: "instagram_posts",
    stuckStatuses: ["pending", "processing"],
    timeColumn: "created_at",
    ttlMs: 20 * MIN,
    terminalStatus: "failed",
    reasonColumn: "error_message",
    policy: "post_instagram_abandonado_marcado_failed",
  },
  {
    table: "instagram_campaigns",
    stuckStatuses: ["pending", "processing"],
    timeColumn: "updated_at",
    ttlMs: 20 * MIN,
    terminalStatus: "failed",
    reasonColumn: "error",
    touchUpdatedAt: true,
    policy: "campanha_instagram_abandonada_marcada_failed",
  },
];

export const REAPER_REASON = "recuperado_por_reaper_tempo_excedido";

/** Máximo de tentativas antes de encerrar definitivamente um item da DLQ. */
export const MAX_RETRY_ATTEMPTS = 5;
/** Retenção mínima de histórico resolvido, para auditoria. */
export const DLQ_RETENTION_DAYS = 30;

const PERMANENT_PATTERNS = [
  "sem imagem",
  "no image",
  "produto indisponivel",
  "produto indisponível",
  "invalid number",
  "not a valid whatsapp",
  "group not found",
  "unauthorized",
  "forbidden",
  "invalid token",
  "token expired",
  "session_dead",
  "device_removed",
  "duplicate_prevented",
];

const PERMANENT_CODES = [
  "PERMANENT",
  "NO_IMAGE",
  "SESSION_DEAD",
  "DUPLICATE_PREVENTED",
  "AUTH",
  "auth",
];

/** Separa erro recuperável (transiente) de erro permanente. */
export function isPermanentFailure(input: {
  error_code?: string | null;
  error_message?: string | null;
}): boolean {
  const code = (input.error_code ?? "").trim();
  if (code && PERMANENT_CODES.some((c) => code.toUpperCase() === c.toUpperCase())) {
    return true;
  }
  const msg = (input.error_message ?? "").toLowerCase();
  return PERMANENT_PATTERNS.some((p) => msg.includes(p));
}

/** Backoff exponencial limitado: 1min, 3min, 9min, 27min, máx 60min. */
export function retryDelayMs(attempt: number): number {
  const a = Math.max(1, attempt);
  return Math.min(60 * MIN, MIN * Math.pow(3, a - 1));
}

export interface DlqDecision {
  action: "schedule_retry" | "exhaust_permanent" | "exhaust_max_attempts" | "wait";
  nextRetryAt?: string;
  reason: string;
}

/**
 * Decisão pura (testável) sobre um item da DLQ.
 * - permanente  -> encerra, nunca entra em loop;
 * - transiente com tentativas disponíveis -> agenda retry com backoff;
 * - transiente sem tentativas -> encerra por esgotamento.
 */
export function decideDlqItem(
  row: {
    attempt_count: number;
    error_code?: string | null;
    error_message?: string | null;
    next_retry_at?: string | null;
  },
  now: number = Date.now(),
): DlqDecision {
  if (isPermanentFailure(row)) {
    return { action: "exhaust_permanent", reason: "erro_permanente_sem_retry" };
  }
  const attempts = Number(row.attempt_count ?? 0);
  if (attempts >= MAX_RETRY_ATTEMPTS) {
    return {
      action: "exhaust_max_attempts",
      reason: `limite_de_${MAX_RETRY_ATTEMPTS}_tentativas_atingido`,
    };
  }
  const scheduled = row.next_retry_at ? Date.parse(row.next_retry_at) : NaN;
  if (Number.isFinite(scheduled) && scheduled > now) {
    return { action: "wait", reason: "retry_ja_agendado" };
  }
  return {
    action: "schedule_retry",
    nextRetryAt: new Date(now + retryDelayMs(attempts + 1)).toISOString(),
    reason: "erro_transiente_reagendado",
  };
}

export interface ReaperReport {
  orphans: Array<{ table: string; recovered: number; error?: string }>;
  dlq: {
    retriesScheduled: number;
    exhaustedPermanent: number;
    exhaustedMaxAttempts: number;
    expired: number;
    error?: string;
  };
  durationMs: number;
}

type Admin = any;

async function reapTable(admin: Admin, spec: OrphanSpec): Promise<{ recovered: number; error?: string }> {
  const cutoff = new Date(Date.now() - spec.ttlMs).toISOString();
  const patch: Record<string, unknown> = { status: spec.terminalStatus };
  if (spec.touchUpdatedAt) patch.updated_at = new Date().toISOString();
  if (spec.reasonColumn) patch[spec.reasonColumn] = REAPER_REASON;

  const { data, error } = await admin
    .from(spec.table)
    .update(patch)
    .in("status", spec.stuckStatuses)
    .lt(spec.timeColumn, cutoff)
    .select("id");

  if (error) {
    reaperLog("REAPER_TABLE_FAILED", { table: spec.table, error: error.message });
    return { recovered: 0, error: error.message };
  }
  const rows = data ?? [];
  for (const r of rows) {
    reaperLog("ORPHAN_RECOVERED", {
      table: spec.table,
      id: r.id,
      from_statuses: spec.stuckStatuses,
      to_status: spec.terminalStatus,
      ttl_ms: spec.ttlMs,
      reason: REAPER_REASON,
      policy: spec.policy,
    });
  }
  return { recovered: rows.length };
}

async function maintainDlq(admin: Admin): Promise<ReaperReport["dlq"]> {
  const out = { retriesScheduled: 0, exhaustedPermanent: 0, exhaustedMaxAttempts: 0, expired: 0 } as ReaperReport["dlq"];

  const { data, error } = await admin
    .from("automation_failures")
    .select("id, user_id, attempt_count, error_code, error_message, next_retry_at, created_at")
    .is("resolved_at", null)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    reaperLog("REAPER_TABLE_FAILED", { table: "automation_failures", error: error.message });
    return { ...out, error: error.message };
  }

  const nowIso = new Date().toISOString();
  for (const row of data ?? []) {
    const decision = decideDlqItem(row);
    if (decision.action === "wait") continue;

    if (decision.action === "schedule_retry") {
      const { error: upErr } = await admin
        .from("automation_failures")
        .update({ next_retry_at: decision.nextRetryAt, updated_at: nowIso })
        .eq("id", row.id);
      if (upErr) continue;
      out.retriesScheduled++;
      reaperLog("RETRY_SCHEDULED", {
        failure_id: row.id,
        user_id: row.user_id,
        attempt_count: row.attempt_count,
        next_retry_at: decision.nextRetryAt,
        reason: decision.reason,
      });
      continue;
    }

    // Encerramento definitivo: resolve o item (mantém histórico para auditoria).
    const { error: upErr } = await admin
      .from("automation_failures")
      .update({ resolved_at: nowIso, next_retry_at: null, updated_at: nowIso })
      .eq("id", row.id);
    if (upErr) continue;
    if (decision.action === "exhaust_permanent") out.exhaustedPermanent++;
    else out.exhaustedMaxAttempts++;
    reaperLog("RETRY_EXHAUSTED", {
      failure_id: row.id,
      user_id: row.user_id,
      attempt_count: row.attempt_count,
      kind: decision.action === "exhaust_permanent" ? "permanent" : "max_attempts",
      reason: decision.reason,
    });
  }

  // Expiração: só remove itens JÁ RESOLVIDOS mais antigos que a retenção.
  const expiryCutoff = new Date(Date.now() - DLQ_RETENTION_DAYS * 24 * 60 * MIN).toISOString();
  const { data: expired, error: delErr } = await admin
    .from("automation_failures")
    .delete()
    .not("resolved_at", "is", null)
    .lt("resolved_at", expiryCutoff)
    .select("id");
  if (delErr) {
    reaperLog("REAPER_TABLE_FAILED", { table: "automation_failures:expiry", error: delErr.message });
    return { ...out, error: delErr.message };
  }
  for (const r of expired ?? []) {
    reaperLog("DLQ_ITEM_EXPIRED", {
      failure_id: r.id,
      retention_days: DLQ_RETENTION_DAYS,
      reason: "resolvido_alem_da_retencao",
    });
    out.expired++;
  }
  return out;
}

/** Executa todos os reapers + manutenção da DLQ. Idempotente e seguro. */
export async function runSystemReaper(admin: Admin): Promise<ReaperReport> {
  const started = Date.now();
  reaperLog("REAPER_STARTED", { tables: ORPHAN_SPECS.map((s) => s.table) });

  const orphans: ReaperReport["orphans"] = [];
  for (const spec of ORPHAN_SPECS) {
    const r = await reapTable(admin, spec);
    orphans.push({ table: spec.table, ...r });
  }

  const dlq = await maintainDlq(admin);

  // Expurgo de eventos de webhook antigos (função já existente no banco).
  try {
    await admin.rpc("cleanup_old_webhook_events");
  } catch {
    /* best effort */
  }

  const report: ReaperReport = { orphans, dlq, durationMs: Date.now() - started };
  reaperLog("REAPER_DONE", {
    recovered_total: orphans.reduce((a, o) => a + o.recovered, 0),
    ...dlq,
    duration_ms: report.durationMs,
  });
  return report;
}
