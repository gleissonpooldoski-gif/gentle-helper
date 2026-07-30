import { describe, it, expect } from "vitest";
import {
  decideDlqItem,
  isPermanentFailure,
  retryDelayMs,
  runSystemReaper,
  MAX_RETRY_ATTEMPTS,
  ORPHAN_SPECS,
} from "@/modules/reliability/reaper.server";

describe("classificação de falhas", () => {
  it("erro de sessão morta é permanente", () => {
    expect(isPermanentFailure({ error_code: "SESSION_DEAD", error_message: null })).toBe(true);
  });
  it("produto sem imagem é permanente", () => {
    expect(isPermanentFailure({ error_message: "Produto sem imagem" })).toBe(true);
  });
  it("timeout de rede é transiente", () => {
    expect(isPermanentFailure({ error_code: "TRANSIENT", error_message: "timeout após 10000ms" })).toBe(false);
  });
});

describe("retry seguro", () => {
  it("agenda retry com backoff crescente", () => {
    const d = decideDlqItem({ attempt_count: 1, error_message: "timeout" }, 0);
    expect(d.action).toBe("schedule_retry");
    expect(Date.parse(d.nextRetryAt!)).toBe(retryDelayMs(2));
    expect(retryDelayMs(1)).toBeLessThan(retryDelayMs(3));
    expect(retryDelayMs(99)).toBe(3_600_000);
  });
  it("erro permanente nunca entra em loop", () => {
    expect(decideDlqItem({ attempt_count: 0, error_code: "SESSION_DEAD" }).action).toBe("exhaust_permanent");
  });
  it("respeita limite máximo de tentativas", () => {
    expect(decideDlqItem({ attempt_count: MAX_RETRY_ATTEMPTS, error_message: "timeout" }).action).toBe(
      "exhaust_max_attempts",
    );
  });
  it("não reagenda quando já existe retry futuro", () => {
    const future = new Date(Date.now() + 600_000).toISOString();
    expect(decideDlqItem({ attempt_count: 1, error_message: "timeout", next_retry_at: future }).action).toBe("wait");
  });
});

/** Admin fake que registra as operações emitidas pelo reaper. */
function makeAdmin(state: Record<string, any[]>) {
  const ops: any[] = [];
  return {
    ops,
    rpc: async () => ({ data: null, error: null }),
    from(table: string) {
      const q: any = {
        _op: null as string | null,
        _patch: null as any,
        _filters: [] as any[],
        update(patch: any) {
          q._op = "update";
          q._patch = patch;
          return q;
        },
        delete() {
          q._op = "delete";
          return q;
        },
        select() {
          if (q._op === null) q._op = "select";
          return q;
        },
        in(col: string, vals: string[]) {
          q._filters.push(["in", col, vals]);
          return q;
        },
        lt(col: string, v: string) {
          q._filters.push(["lt", col, v]);
          return q;
        },
        eq(col: string, v: string) {
          q._filters.push(["eq", col, v]);
          return q;
        },
        is(col: string, v: any) {
          q._filters.push(["is", col, v]);
          return q;
        },
        not(col: string, op: string, v: any) {
          q._filters.push(["not", col, op, v]);
          return q;
        },
        order() {
          return q;
        },
        limit() {
          return q;
        },
        then(resolve: any) {
          const rows = state[table] ?? [];
          if (q._op === "select") return resolve({ data: rows, error: null });
          ops.push({ table, op: q._op, patch: q._patch, filters: q._filters });
          if (q._op === "update" && table !== "automation_failures") {
            // Simula que os órfãos elegíveis foram atualizados.
            return resolve({ data: rows.map((r: any) => ({ id: r.id })), error: null });
          }
          return resolve({ data: [], error: null });
        },
      };
      return q;
    },
  };
}

describe("reaper genérico", () => {
  it("recupera registro preso e nunca reenvia", async () => {
    const admin = makeAdmin({
      automation_group_sends: [{ id: "claim-preso" }],
      automation_failures: [],
    });
    const report = await runSystemReaper(admin as any);

    const claimOp = admin.ops.find((o) => o.table === "automation_group_sends");
    expect(claimOp.op).toBe("update");
    // Estado terminal seguro: nenhum worker relê `failed` para reenviar.
    expect(claimOp.patch.status).toBe("failed");
    // O reaper JAMAIS apaga um claim (apagar liberaria reenvio duplicado).
    expect(admin.ops.some((o) => o.op === "delete" && o.table === "automation_group_sends")).toBe(false);
    expect(report.orphans.find((o) => o.table === "automation_group_sends")!.recovered).toBe(1);
  });

  it("cobre todas as tabelas com estado em andamento", () => {
    expect(ORPHAN_SPECS.map((s) => s.table)).toEqual([
      "automation_group_sends",
      "manual_posts",
      "instagram_posts",
      "instagram_campaigns",
    ]);
    for (const s of ORPHAN_SPECS) expect(s.terminalStatus).toBe("failed");
  });

  it("agenda retry de item transiente na DLQ", async () => {
    const admin = makeAdmin({
      automation_group_sends: [],
      manual_posts: [],
      instagram_posts: [],
      instagram_campaigns: [],
      automation_failures: [
        { id: "f1", user_id: "u1", attempt_count: 1, error_code: "TRANSIENT", error_message: "timeout", next_retry_at: null },
      ],
    });
    const report = await runSystemReaper(admin as any);
    expect(report.dlq.retriesScheduled).toBe(1);
    const patch = admin.ops.find((o) => o.table === "automation_failures" && o.op === "update")!.patch;
    expect(patch.next_retry_at).toBeTruthy();
    expect(patch.resolved_at).toBeUndefined();
  });
});
