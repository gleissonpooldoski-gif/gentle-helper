import { describe, expect, it } from "vitest";
import {
  classifyTunnelHttpStatus,
  normalizeTunnelUrl,
} from "../tunnel.server";

describe("classifyTunnelHttpStatus", () => {
  it("200 => ONLINE", () => {
    const r = classifyTunnelHttpStatus(200);
    expect(r.status).toBe("ONLINE");
    expect(r.ok).toBe(true);
  });

  it("401 e 403 => ONLINE (a API respondeu)", () => {
    for (const code of [401, 403]) {
      const r = classifyTunnelHttpStatus(code);
      expect(r.status).toBe("ONLINE");
      expect(r.ok).toBe(true);
    }
  });

  it("404 => ERROR de configuração", () => {
    const r = classifyTunnelHttpStatus(404);
    expect(r.status).toBe("ERROR");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Configuração errada/i);
  });

  it("530 => tunnel offline", () => {
    const r = classifyTunnelHttpStatus(530);
    expect(r.status).toBe("OFFLINE");
    expect(r.message).toMatch(/Tunnel offline/i);
  });

  it("522 => origem offline", () => {
    expect(classifyTunnelHttpStatus(522).status).toBe("OFFLINE");
    expect(classifyTunnelHttpStatus(522).message).toMatch(/Origem offline/i);
  });

  it("523 => erro de DNS/túnel", () => {
    expect(classifyTunnelHttpStatus(523).message).toMatch(/DNS/i);
  });

  it("524 => timeout", () => {
    expect(classifyTunnelHttpStatus(524).message).toMatch(/Timeout/i);
  });

  it("500 => ERROR", () => {
    expect(classifyTunnelHttpStatus(500).status).toBe("ERROR");
  });
});

describe("normalizeTunnelUrl", () => {
  it("remove barras finais e path", () => {
    expect(normalizeTunnelUrl("https://abc.trycloudflare.com/")).toBe(
      "https://abc.trycloudflare.com",
    );
  });

  it("rejeita url vazia", () => {
    expect(() => normalizeTunnelUrl("  ")).toThrow();
  });

  it("rejeita protocolo inválido", () => {
    expect(() => normalizeTunnelUrl("ftp://abc.com")).toThrow(/http/);
  });

  it("rejeita string que não é URL", () => {
    expect(() => normalizeTunnelUrl("abc.trycloudflare.com")).toThrow();
  });
});
