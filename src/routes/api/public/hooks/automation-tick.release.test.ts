import { describe, expect, it, vi } from "vitest";
import { claimAndSendMediaOnceForAutomation } from "./automation-tick";

const evolutionJson = vi.fn();

vi.mock("@/modules/whatsapp/evolution/client.server", () => ({
  evolutionJson,
}));

type GuardRow = {
  id: string;
  user_id: string;
  config_id: string;
  product_id: string;
  group_id: string;
  status: string;
  worker_id: string;
  message_id?: string | null;
  sent_at?: string | null;
  updated_at?: string | null;
};

/**
 * LOTE 14 — harness com suporte a DELETE (liberação de claim).
 */
function createGuardAdmin() {
  const rows = new Map<string, GuardRow>();
  let seq = 0;
  const keyOf = (row: Pick<GuardRow, "config_id" | "product_id" | "group_id">) =>
    `${row.config_id}|${row.product_id}|${row.group_id ?? ""}`;

  function filtered(filters: Array<[string, unknown]>) {
    return [...rows.entries()].filter(([, row]) =>
      filters.every(([column, value]) => row[column as keyof GuardRow] === value),
    );
  }

  function thenableWithEq(run: (filters: Array<[string, unknown]>) => { data: unknown; error: unknown }) {
    const filters: Array<[string, unknown]> = [];
    const query: any = {
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return query;
      },
      then(resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) {
        return Promise.resolve()
          .then(() => run(filters))
          .then(resolve, reject);
      },
    };
    return query;
  }

  return {
    rows,
    from() {
      return {
        insert(payload: Omit<GuardRow, "id">) {
          const key = keyOf(payload);
          const existing = rows.get(key);
          const result = existing
            ? { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } }
            : (() => {
                const row: GuardRow = { ...payload, id: `claim-${++seq}` };
                rows.set(key, row);
                return { data: row, error: null };
              })();
          return { select: () => ({ single: async () => result }) };
        },
        select() {
          return thenableWithEq((filters) => ({ data: filtered(filters).map(([, r]) => r), error: null }));
        },
        update(patch: Partial<GuardRow>) {
          return thenableWithEq((filters) => {
            for (const [, row] of filtered(filters)) Object.assign(row, patch);
            return { data: null, error: null };
          });
        },
        delete() {
          return thenableWithEq((filters) => {
            for (const [key] of filtered(filters)) rows.delete(key);
            return { data: null, error: null };
          });
        },
      };
    },
  };
}

const cfg = { id: "cfg-1", user_id: "user-1" };
const product = { id: "prod-1" };
const group = { group_jid: "120363@g.us", group_name: "Grupo" };

function run(admin: ReturnType<typeof createGuardAdmin>) {
  return claimAndSendMediaOnceForAutomation({
    admin,
    cfg,
    product,
    group,
    instanceName: "instance-1",
    mediaUrl: "https://example.test/prod.jpg",
    caption: "Oferta",
    workerId: "worker-1",
    ctx: { worker_id: "worker-1", config_id: cfg.id, product_id: product.id, group_id: group.group_jid },
  });
}

describe("LOTE 14 — liberação de claim com prova de não-entrega", () => {
  it("libera o claim quando a Evolution rejeita o envio (sessão morta)", async () => {
    evolutionJson.mockReset();
    evolutionJson.mockRejectedValue(
      new Error(
        'Evolution API 500 em /message/sendMedia/instance-1: {"status":500,"error":"Internal Server Error","response":{"message":["Error: Connection Closed"]}}',
      ),
    );
    const admin = createGuardAdmin();

    const result = await run(admin);

    expect(result.outcome).toBe("failed");
    expect(result).toMatchObject({ claimReleased: true, sessionDead: true });
    // Produto volta ao ciclo: nenhuma reserva remanescente.
    expect(admin.rows.size).toBe(0);
  });

  it("libera o claim quando o envio nem chegou a ocorrer (breaker aberto)", async () => {
    evolutionJson.mockReset();
    const admin = createGuardAdmin();

    const result = await claimAndSendMediaOnceForAutomation({
      admin,
      cfg,
      product,
      group,
      instanceName: "instance-1",
      mediaUrl: "https://example.test/prod.jpg",
      caption: "Oferta",
      workerId: "worker-1",
      ctx: {},
      beforeSend: async () => {
        throw new Error("Circuit breaker aberto (instância com falhas consecutivas)");
      },
    });

    expect(result).toMatchObject({ outcome: "failed", claimReleased: true });
    expect(evolutionJson).not.toHaveBeenCalled();
    expect(admin.rows.size).toBe(0);
  });

  it("NÃO libera o claim em erro ambíguo (timeout) — fail-safe anti-duplicidade", async () => {
    evolutionJson.mockReset();
    evolutionJson.mockRejectedValue(new Error("Evolution API indisponível. Verifique a conexão."));
    const admin = createGuardAdmin();

    const result = await run(admin);

    expect(result).toMatchObject({ outcome: "failed", claimReleased: false });
    // Reserva permanece: o produto NUNCA será reenviado neste ciclo.
    expect([...admin.rows.values()][0]).toMatchObject({ status: "failed" });
  });

  it("mantém unicidade: após liberação, apenas 1 envio real em 50 concorrentes", async () => {
    evolutionJson.mockReset();
    evolutionJson.mockResolvedValue({ messageId: "msg-1" });
    const admin = createGuardAdmin();

    const results = await Promise.all(Array.from({ length: 50 }, () => run(admin)));

    expect(results.filter((r) => r.outcome === "sent")).toHaveLength(1);
    expect(evolutionJson).toHaveBeenCalledTimes(1);
  });
});
