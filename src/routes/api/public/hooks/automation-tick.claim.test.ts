import { describe, expect, it, vi } from "vitest";
import { claimAndSendMediaOnceForAutomation } from "./automation-tick";

const evolutionJson = vi.fn(async () => ({ messageId: "msg-1" }));

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

function createGuardAdmin() {
  const rows = new Map<string, GuardRow>();
  let seq = 0;
  const keyOf = (row: Pick<GuardRow, "config_id" | "product_id" | "group_id">) =>
    `${row.config_id}|${row.product_id}|${row.group_id ?? ""}`;

  function makeThenable(run: () => { data: unknown; error: unknown }) {
    return {
      then(resolve: (value: { data: unknown; error: unknown }) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve()
          .then(run)
          .then(resolve, reject);
      },
    };
  }

  return {
    rows,
    from(table: string) {
      expect(table).toBe("automation_group_sends");
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
          return {
            select() {
              return {
                single: async () => result,
              };
            },
          };
        },
        select() {
          const filters: Array<[string, unknown]> = [];
          const query = {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              return query;
            },
            then(resolve: (value: { data: GuardRow[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
              return Promise.resolve()
                .then(() => ({
                  data: [...rows.values()].filter((row) =>
                    filters.every(([column, value]) => row[column as keyof GuardRow] === value),
                  ),
                  error: null,
                }))
                .then(resolve, reject);
            },
          };
          return query;
        },
        update(patch: Partial<GuardRow>) {
          const filters: Array<[string, unknown]> = [];
          const query = makeThenable(() => {
            for (const row of rows.values()) {
              if (filters.every(([column, value]) => row[column as keyof GuardRow] === value)) {
                Object.assign(row, patch);
              }
            }
            return { data: null, error: null };
          }) as ReturnType<typeof makeThenable> & { eq: (column: string, value: unknown) => unknown };
          query.eq = (column: string, value: unknown) => {
            filters.push([column, value]);
            return query;
          };
          return query;
        },
      };
    },
  };
}

describe("automation atomic claim send flow", () => {
  it("permite apenas 1 envio real em 100 fluxos concorrentes completos", async () => {
    evolutionJson.mockClear();
    const admin = createGuardAdmin();
    const cfg = { id: "cfg-1", user_id: "user-1" };
    const product = { id: "prod-1" };
    const group = { group_jid: "120363@g.us", group_name: "Grupo" };

    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        claimAndSendMediaOnceForAutomation({
          admin,
          cfg,
          product,
          group,
          instanceName: "instance-1",
          mediaUrl: "https://example.test/prod.jpg",
          caption: "Oferta",
          workerId: `worker-${i}`,
          ctx: { worker_id: `worker-${i}`, config_id: cfg.id, product_id: product.id, group_id: group.group_jid },
        }),
      ),
    );

    expect(results.filter((r) => r.outcome === "sent")).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "duplicate")).toHaveLength(99);
    expect(evolutionJson).toHaveBeenCalledTimes(1);
    expect(evolutionJson).toHaveBeenCalledWith(
      "/message/sendMedia/instance-1",
      expect.objectContaining({ method: "POST", retries: 0 }),
    );
    expect([...admin.rows.values()][0]).toEqual(
      expect.objectContaining({ status: "sent", worker_id: "worker-0", message_id: "msg-1" }),
    );
  });
});