import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AutomationConfigDTO } from "@/modules/automation/automation.functions";

// -------------------- Mocks --------------------

// useServerFn(fn) → fn (identity), so os handlers chamam nossos spies direto.
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: any) => fn,
  createServerFn: () => ({
    middleware: () => ({
      inputValidator: () => ({ handler: () => async () => undefined }),
      handler: () => async () => undefined,
    }),
    inputValidator: () => ({ handler: () => async () => undefined }),
    handler: () => async () => undefined,
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// "Banco de dados" em memória. Chave = `${channelId}|${groupId ?? ''}`.
// Emula o unique index (user_id, channel_id, coalesce(group_id,'')):
// duas chamadas com mesmo escopo NUNCA criam duas linhas.
type Row = AutomationConfigDTO;

const mocks = vi.hoisted(() => {
  const db = new Map<string, any>();
  const key = (channelId: string, groupId: string | null | undefined) =>
    `${channelId}|${groupId ?? ""}`;
  const baseRow = (channelId: string, groupId: string | null, groupName: string | null) => ({
    id: `row-${key(channelId, groupId)}`,
    channelId,
    groupId,
    groupName,
    horaInicio: "07:00",
    horaFim: "22:00",
    intervaloMin: 15,
    lojasAtivas: ["shopee", "mercadolivre"],
    postLoop: true,
    status: "idle",
    currentIndex: 0,
    nextRunAt: null,
    lastError: null,
    lastSentAt: null,
    lastProductName: null,
    queueSize: 0,
    currentProduct: null,
  });

  return {
    db,
    key,
    listAutomationGroups: vi.fn(async ({ data }: any) => {
      if (data.channelId !== "c1") return [];
      return [
        { groupId: "g1", groupName: "Grupo Um" },
        { groupId: "g2", groupName: "Grupo Dois" },
        { groupId: "g3", groupName: "Grupo Três" },
      ];
    }),
    getAutomationConfig: vi.fn(async ({ data }: any) => {
      const k = key(data.channelId, data.groupId);
      if (!db.has(k)) db.set(k, baseRow(data.channelId, data.groupId ?? null, data.groupName ?? null));
      return db.get(k)!;
    }),
    saveAutomationConfig: vi.fn(async ({ data }: any) => {
      const k = key(data.channelId, data.groupId);
      const prev = db.get(k) ?? baseRow(data.channelId, data.groupId ?? null, data.groupName ?? null);
      const next = {
        ...prev,
        horaInicio: String(data.horaInicio).slice(0, 5),
        horaFim: String(data.horaFim).slice(0, 5),
        intervaloMin: data.intervaloMin,
        lojasAtivas: data.lojasAtivas,
        postLoop: data.postLoop,
      };
      db.set(k, next);
      return next;
    }),
    startAutomation: vi.fn(async ({ data }: any) => db.get(key(data.channelId, data.groupId))!),
    stopAutomation: vi.fn(async ({ data }: any) => db.get(key(data.channelId, data.groupId))!),
    listCampaignHistory: vi.fn(async () => []),
  };
});

const {
  db,
  key,
  listAutomationGroups,
  getAutomationConfig,
  saveAutomationConfig,
  startAutomation,
  stopAutomation,
  listCampaignHistory,
} = mocks;

vi.mock("@/modules/automation/automation.functions", () => ({
  listAutomationGroups: mocks.listAutomationGroups,
  getAutomationConfig: mocks.getAutomationConfig,
  saveAutomationConfig: mocks.saveAutomationConfig,
  startAutomation: mocks.startAutomation,
  stopAutomation: mocks.stopAutomation,
  listCampaignHistory: mocks.listCampaignHistory,
}));


// -------------------- Setup --------------------

import { GroupAutomationList } from "@/components/automation/GroupAutomationList";

beforeEach(() => {
  db.clear();
  listAutomationGroups.mockClear();
  getAutomationConfig.mockClear();
  saveAutomationConfig.mockClear();
  startAutomation.mockClear();
  stopAutomation.mockClear();
  listCampaignHistory.mockClear();
  cleanup();
});

async function openEditor(groupLabel: RegExp) {
  const item = (await screen.findByText(groupLabel)).closest("li")!;
  const btn = within(item as HTMLElement).getByRole("button", { name: /editar/i });
  await userEvent.click(btn);
}

async function waitForPanel(_expectedGroupName: string) {
  // Botão Salvar só renderiza depois de loading=false (config carregada)
  await screen.findByRole("button", { name: /salvar/i }, { timeout: 3000 });
}



// -------------------- Tests --------------------

describe("Isolamento por grupo — GroupAutomationList + AutomationPanel", () => {
  it("Abrir Grupo 1 deve carregar Grupo 1", async () => {
    render(<GroupAutomationList channelId="c1" />);
    await openEditor(/Grupo Um/);
    await waitForPanel("Grupo Um");

    // getAutomationConfig recebeu exatamente o escopo do Grupo 1
    const calls = getAutomationConfig.mock.calls.map((c) => c[0].data);
    expect(calls).toContainEqual(
      expect.objectContaining({ channelId: "c1", groupId: "g1" }),
    );
    expect(calls).not.toContainEqual(expect.objectContaining({ groupId: "g2" }));
  });

  it("Abrir Grupo 2 deve carregar Grupo 2 (nunca a config do Grupo 1)", async () => {
    render(<GroupAutomationList channelId="c1" />);

    // Abre G1 primeiro, fecha, abre G2. Estado local do painel deve remontar.
    await openEditor(/Grupo Um/);
    await waitForPanel("Grupo Um");
    // Fecha o dialog (ESC)
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText(/Grupo Um/)).toBeInTheDocument());

    await openEditor(/Grupo Dois/);
    await waitForPanel("Grupo Dois");

    const g2Calls = getAutomationConfig.mock.calls
      .map((c) => c[0].data)
      .filter((d) => d.groupId === "g2");
    expect(g2Calls.length).toBeGreaterThan(0);
    // O painel do G2 nunca deve ter buscado pelo G1 depois de aberto
    const lastCall = getAutomationConfig.mock.calls.at(-1)![0].data;
    expect(lastCall.groupId).toBe("g2");
  });

  it("Alterar Grupo 2 não pode alterar Grupo 1", async () => {
    render(<GroupAutomationList channelId="c1" />);

    // 1) Cria a config default de G1 apenas por abrir
    await openEditor(/Grupo Um/);
    await waitForPanel("Grupo Um");
    const g1Before = { ...db.get(key("c1", "g1"))! };
    await userEvent.keyboard("{Escape}");

    // 2) Edita G2: muda intervalo e salva
    await openEditor(/Grupo Dois/);
    await waitForPanel("Grupo Dois");
    // input de intervalo: type=number, valor default 15
    const intervalInput = screen.getByDisplayValue("15") as HTMLInputElement;
    fireEvent.change(intervalInput, { target: { value: "42" } });

    await userEvent.click(screen.getByRole("button", { name: /salvar/i }));


    await waitFor(() => {
      expect(db.get(key("c1", "g2"))?.intervaloMin).toBe(42);
    });

    // 3) A linha do G1 permanece intocada
    const g1After = db.get(key("c1", "g1"))!;
    expect(g1After).toEqual(g1Before);
    expect(g1After.intervaloMin).toBe(15);

    // saveFn nunca foi chamado com groupId=g1
    const saveScopes = saveAutomationConfig.mock.calls.map((c) => c[0].data.groupId);
    expect(saveScopes).not.toContain("g1");
    expect(saveScopes).toContain("g2");
  });

  it("Abrir Grupo 3 deve carregar somente Grupo 3", async () => {
    render(<GroupAutomationList channelId="c1" />);
    await openEditor(/Grupo Três/);
    await waitForPanel("Grupo Três");

    const lastCall = getAutomationConfig.mock.calls.at(-1)?.[0].data;
    expect(lastCall).toEqual(expect.objectContaining({ channelId: "c1", groupId: "g3" }));
  });

  it("Remontar a página mantém o grupo correto pelo channelId atual", async () => {
    const first = render(<GroupAutomationList channelId="c1" />);
    await openEditor(/Grupo Dois/);
    await waitForPanel("Grupo Dois");
    first.unmount();

    render(<GroupAutomationList channelId="c1" />);
    await openEditor(/Grupo Dois/);
    await waitForPanel("Grupo Dois");

    const lastCall = getAutomationConfig.mock.calls.at(-1)?.[0].data;
    expect(lastCall).toEqual(expect.objectContaining({ channelId: "c1", groupId: "g2" }));
  });

  it("Salvar duas vezes no mesmo grupo não pode criar duplicação", async () => {
    render(<GroupAutomationList channelId="c1" />);
    await openEditor(/Grupo Dois/);
    await waitForPanel("Grupo Dois");

    const saveBtn = screen.getByRole("button", { name: /salvar/i });
    await userEvent.click(saveBtn);
    await waitFor(() => expect(saveAutomationConfig).toHaveBeenCalledTimes(1));
    await userEvent.click(saveBtn);
    await waitFor(() => expect(saveAutomationConfig).toHaveBeenCalledTimes(2));

    // Duas chamadas de save, sempre no mesmo escopo (c1,g2), UMA única linha
    const rowsForG2 = [...db.keys()].filter((k) => k === key("c1", "g2"));
    expect(rowsForG2).toHaveLength(1);

    // E nenhuma linha vazou para outros escopos
    expect([...db.keys()].sort()).toEqual([key("c1", "g2")]);
  });
});
