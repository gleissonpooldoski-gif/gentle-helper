import { describe, it, expect, vi } from "vitest";
import { fetchWithTimeout, classifyResponse, isTimeoutError, TIMEOUTS } from "@/lib/http-timeout";

describe("fetchWithTimeout", () => {
  it("aborta uma API lenta e classifica como timeout", async () => {
    vi.stubGlobal("fetch", (_u: any, init: any) => new Promise((_r, rej) => {
      init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    const started = Date.now();
    const err = await fetchWithTimeout("https://slow.example", {}, { timeoutMs: 300, label: "slow-api" }).catch((e) => e);
    expect(isTimeoutError(err)).toBe(true);
    expect(err.kind).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(2000);
    vi.unstubAllGlobals();
  });

  it("não afeta chamadas rápidas", async () => {
    vi.stubGlobal("fetch", async () => new Response("ok", { status: 200 }));
    const res = await fetchWithTimeout("https://fast.example", {}, { timeoutMs: 1000, label: "fast" });
    expect(res.status).toBe(200);
    vi.unstubAllGlobals();
  });

  it("diferencia auth de erro de API", () => {
    expect(classifyResponse(new Response("", { status: 401 }), "x")!.kind).toBe("auth");
    expect(classifyResponse(new Response("", { status: 500 }), "x")!.kind).toBe("api");
    expect(classifyResponse(new Response("", { status: 200 }), "x")).toBeNull();
  });

  it("timeouts padrão definidos", () => {
    expect(TIMEOUTS.api).toBe(10000);
    expect(TIMEOUTS.ai).toBe(20000);
  });
});
