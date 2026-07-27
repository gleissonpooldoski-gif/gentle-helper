import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  persistValidation,
  DEGRADATION_FAILURE_THRESHOLD,
} from "@/modules/products/validation/validate.server";

/**
 * LOTE 26 — Cobertura da proteção anti-falso-negativo.
 * Não faz rede: apenas simula o cliente Supabase e verifica o payload
 * que seria gravado em `products` a cada resultado.
 */
function makeAdmin(initial: {
  availability: string | null;
  validation_failure_count?: number;
}) {
  const updates: any[] = [];
  const admin: any = {
    from() {
      return admin;
    },
    select() {
      return admin;
    },
    eq() {
      return admin;
    },
    maybeSingle() {
      return Promise.resolve({ data: initial });
    },
    update(payload: any) {
      updates.push(payload);
      return {
        eq() {
          return {
            eq() {
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  return { admin, updates };
}

describe("persistValidation — proteção anti-falso-negativo", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("sucesso zera contador e mantém 'active'", async () => {
    const { admin, updates } = makeAdmin({
      availability: "active",
      validation_failure_count: 2,
    });
    await persistValidation(admin, "p1", "c1", { availability: "active" }, "cron");
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      availability: "active",
      validation_failure_count: 0,
      validation_error: null,
    });
  });

  it("1 falha NÃO degrada — preserva 'active' e incrementa contador", async () => {
    const { admin, updates } = makeAdmin({
      availability: "active",
      validation_failure_count: 0,
    });
    await persistValidation(
      admin,
      "p1",
      "c1",
      { availability: "inactive", reason: "http 502" },
      "cron",
    );
    expect(updates[0]).toMatchObject({
      availability: "active",
      validation_failure_count: 1,
      validation_error: "http 502",
    });
  });

  it("degrada apenas ao atingir o threshold consecutivo", async () => {
    const { admin, updates } = makeAdmin({
      availability: "active",
      validation_failure_count: DEGRADATION_FAILURE_THRESHOLD - 1,
    });
    await persistValidation(
      admin,
      "p1",
      "c1",
      { availability: "inactive", reason: "http 404" },
      "cron",
    );
    expect(updates[0]).toMatchObject({
      availability: "inactive",
      validation_failure_count: DEGRADATION_FAILURE_THRESHOLD,
    });
  });

  it("emite log estruturado PRODUCT_AVAILABILITY_CHANGED em transição real", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { admin } = makeAdmin({
      availability: "active",
      validation_failure_count: DEGRADATION_FAILURE_THRESHOLD - 1,
    });
    await persistValidation(
      admin,
      "p1",
      "c1",
      { availability: "inactive", reason: "http 404" },
      "cron",
    );
    const logs = spy.mock.calls.map((c) => String(c[0]));
    const line = logs.find((l) => l.includes("[PRODUCT_AVAILABILITY_CHANGED]"));
    expect(line).toBeTruthy();
    expect(line).toContain('"previous":"active"');
    expect(line).toContain('"next":"inactive"');
    expect(line).toContain('"origin":"cron"');
    expect(line).toContain('"degraded":true');
  });

  it("não loga quando availability efetiva permanece igual", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { admin } = makeAdmin({
      availability: "active",
      validation_failure_count: 0,
    });
    await persistValidation(
      admin,
      "p1",
      "c1",
      { availability: "error", reason: "timeout" },
      "automation-tick",
    );
    const logs = spy.mock.calls.map((c) => String(c[0]));
    expect(logs.find((l) => l.includes("[PRODUCT_AVAILABILITY_CHANGED]"))).toBeUndefined();
  });
});
