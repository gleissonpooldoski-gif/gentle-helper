import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { MessageCircle, QrCode, RefreshCw, Send, Power } from "lucide-react";
import { toast } from "sonner";

import { AppSidebar } from "@/components/app-sidebar";
import {
  getEvolutionUserSettings,
  saveEvolutionUserSettings,
  getEvolutionConnectionState,
  createEvolutionInstance,
  connectEvolutionInstance,
  disconnectEvolutionInstance,
} from "@/modules/whatsapp/evolution/user-settings.functions";
import {
  sendWhatsAppMessage,
  listWhatsAppMessages,
} from "@/modules/whatsapp/messaging.functions";

export const Route = createFileRoute("/whatsapp")({
  head: () => ({
    meta: [
      { title: "WhatsApp | DivulgaLinks" },
      {
        name: "description",
        content:
          "Conecte sua instância da Evolution API, gere QR Code, acompanhe o status da conexão e envie mensagens de WhatsApp.",
      },
      { property: "og:title", content: "WhatsApp | DivulgaLinks" },
      {
        property: "og:description",
        content: "Painel de conexão WhatsApp via Evolution API: status, QR Code e envio de mensagens.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WhatsAppPage,
});

const STATUS_UI: Record<string, { dot: string; label: string }> = {
  connected: { dot: "🟢", label: "Conectado" },
  awaiting_qr: { dot: "🟡", label: "Aguardando QR Code" },
  disconnected: { dot: "🔴", label: "Desconectado" },
  unknown: { dot: "⚪", label: "Indefinido" },
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const btnCls =
  "inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground transition hover:opacity-90 disabled:opacity-50";
const btnPrimary =
  "inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50";

function WhatsAppPage() {
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getEvolutionUserSettings);
  const saveSettings = useServerFn(saveEvolutionUserSettings);
  const fetchState = useServerFn(getEvolutionConnectionState);
  const createInstance = useServerFn(createEvolutionInstance);
  const connectInstance = useServerFn(connectEvolutionInstance);
  const disconnectInstance = useServerFn(disconnectEvolutionInstance);
  const sendMessage = useServerFn(sendWhatsAppMessage);
  const fetchMessages = useServerFn(listWhatsAppMessages);

  const settings = useQuery({ queryKey: ["evo-settings"], queryFn: () => fetchSettings() });
  const state = useQuery({
    queryKey: ["evo-state"],
    queryFn: () => fetchState(),
    refetchInterval: 20_000,
  });
  const messages = useQuery({
    queryKey: ["wa-messages"],
    queryFn: () => fetchMessages({ data: { limit: 30 } }),
  });

  const [form, setForm] = useState<{ baseUrl?: string; apiKey: string; instanceName?: string }>({ apiKey: "" });
  const [qr, setQr] = useState<{ qrCode: string | null; pairingCode: string | null } | null>(null);
  const [test, setTest] = useState({ number: "", message: "Olá, sua compra foi confirmada." });

  const baseUrl = form.baseUrl ?? settings.data?.baseUrl ?? "";
  const instanceName = form.instanceName ?? settings.data?.instanceName ?? "";
  const st = STATUS_UI[state.data?.status ?? "unknown"]!;

  const saveMut = useMutation({
    mutationFn: () =>
      saveSettings({ data: { baseUrl, apiKey: form.apiKey || undefined, instanceName } }),
    onSuccess: () => {
      toast.success("Configurações salvas");
      setForm((f) => ({ ...f, apiKey: "" }));
      qc.invalidateQueries({ queryKey: ["evo-settings"] });
      qc.invalidateQueries({ queryKey: ["evo-state"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: () => createInstance({ data: { instanceName } }),
    onSuccess: (r) => {
      setQr({ qrCode: r.qrCode, pairingCode: null });
      toast.success("Instância criada. Escaneie o QR Code.");
      qc.invalidateQueries({ queryKey: ["evo-state"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const qrMut = useMutation({
    mutationFn: () => connectInstance({ data: { instanceName } }),
    onSuccess: (r) => {
      setQr(r);
      if (!r.qrCode && !r.pairingCode) toast.info("Nenhum QR retornado — a instância pode já estar conectada.");
      qc.invalidateQueries({ queryKey: ["evo-state"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnectMut = useMutation({
    mutationFn: () => disconnectInstance({ data: { instanceName } }),
    onSuccess: (r) => {
      setQr(null);
      r.ok ? toast.success(r.message) : toast.error(r.message);
      qc.invalidateQueries({ queryKey: ["evo-state"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendMut = useMutation({
    mutationFn: () => sendMessage({ data: { number: test.number, message: test.message, instanceName } }),
    onSuccess: (r) => {
      r.ok ? toast.success("Mensagem enviada") : toast.error(r.error ?? "Falha no envio");
      qc.invalidateQueries({ queryKey: ["wa-messages"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar activeId="whatsapp" />
      <main className="flex-1 space-y-5 p-6">
        <header className="flex items-center gap-3">
          <MessageCircle className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">WhatsApp</h1>
            <p className="text-sm text-muted-foreground">Integração com a Evolution API (v2.3.7)</p>
          </div>
          <button
            className={`${btnCls} ml-auto`}
            onClick={() => state.refetch()}
            disabled={state.isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${state.isFetching ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </header>

        <div className="grid gap-4 md:grid-cols-4">
          <Card title="Status">
            <p className="text-lg font-semibold">
              {st.dot} {st.label}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{state.data?.message ?? "Carregando…"}</p>
          </Card>
          <Card title="Instância">
            <p className="text-lg font-semibold">{state.data?.instanceName ?? (instanceName || "—")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Credenciais: {settings.data?.source === "user" ? "próprias" : "padrão do sistema"}
            </p>
          </Card>
          <Card title="Número">
            <p className="text-lg font-semibold">{state.data?.phone ? `+${state.data.phone}` : "—"}</p>
          </Card>
          <Card title="Última atividade">
            <p className="text-sm">
              {state.data?.lastActivity ? new Date(state.data.lastActivity).toLocaleString("pt-BR") : "—"}
            </p>
          </Card>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className={btnPrimary} onClick={() => createMut.mutate()} disabled={!instanceName || createMut.isPending}>
            <Power className="h-4 w-4" /> Conectar WhatsApp
          </button>
          <button className={btnCls} onClick={() => qrMut.mutate()} disabled={!instanceName || qrMut.isPending}>
            <QrCode className="h-4 w-4" /> Gerar QR Code
          </button>
          <button
            className={btnCls}
            onClick={() => disconnectMut.mutate()}
            disabled={!instanceName || disconnectMut.isPending}
          >
            <Power className="h-4 w-4" /> Desconectar
          </button>
        </div>

        {qr?.qrCode ? (
          <Card title="QR Code">
            <img src={qr.qrCode} alt="QR Code para conectar o WhatsApp" className="h-64 w-64 rounded-lg bg-white p-2" />
            {qr.pairingCode ? (
              <p className="mt-2 text-sm">
                Código de pareamento: <span className="font-mono font-semibold">{qr.pairingCode}</span>
              </p>
            ) : null}
          </Card>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Configuração da Evolution API">
            <div className="space-y-3">
              <Field label="URL da Evolution API">
                <input
                  className={inputCls}
                  value={baseUrl}
                  placeholder="https://minha-url-da-evolution.com"
                  onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                />
              </Field>
              <Field label={`API Key ${settings.data?.hasApiKey ? "(salva — preencha para substituir)" : ""}`}>
                <input
                  className={inputCls}
                  type="password"
                  value={form.apiKey}
                  placeholder="••••••••"
                  onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                />
              </Field>
              <Field label="Nome da instância">
                <input
                  className={inputCls}
                  value={instanceName}
                  placeholder="cliente01"
                  onChange={(e) => setForm((f) => ({ ...f, instanceName: e.target.value }))}
                />
              </Field>
              <button className={btnPrimary} onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                Salvar configurações
              </button>
              <p className="text-xs text-muted-foreground">
                A API Key é criptografada e nunca é devolvida ao navegador.
              </p>
            </div>
          </Card>

          <Card title="Testar envio">
            <div className="space-y-3">
              <Field label="Número destino (DDI + DDD + número)">
                <input
                  className={inputCls}
                  value={test.number}
                  placeholder="5511999999999"
                  onChange={(e) => setTest((t) => ({ ...t, number: e.target.value }))}
                />
              </Field>
              <Field label="Mensagem">
                <textarea
                  className={`${inputCls} min-h-24`}
                  value={test.message}
                  onChange={(e) => setTest((t) => ({ ...t, message: e.target.value }))}
                />
              </Field>
              <button className={btnPrimary} onClick={() => sendMut.mutate()} disabled={sendMut.isPending}>
                <Send className="h-4 w-4" /> Enviar mensagem
              </button>
            </div>
          </Card>
        </div>

        <Card title="Instâncias na Evolution">
          <ul className="space-y-1 text-sm">
            {(state.data?.instances ?? []).map((i) => (
              <li key={i.name} className="flex flex-wrap gap-x-3 border-b border-border/50 py-1">
                <span className="font-medium">{i.name}</span>
                <span className="text-muted-foreground">{i.state}</span>
                {i.phone ? <span className="text-muted-foreground">+{i.phone}</span> : null}
              </li>
            ))}
            {!state.data?.instances?.length ? (
              <li className="text-muted-foreground">Nenhuma instância encontrada.</li>
            ) : null}
          </ul>
        </Card>

        <Card title="Histórico de mensagens">
          <ul className="space-y-1 text-sm">
            {(messages.data ?? []).map((m) => (
              <li key={m.id} className="flex flex-wrap gap-x-3 border-b border-border/50 py-1">
                <span className="text-muted-foreground">{new Date(m.createdAt).toLocaleString("pt-BR")}</span>
                <span>{m.direction === "outbound" ? "→" : "←"}</span>
                <span className="font-medium">{m.phone}</span>
                <span className="truncate">{m.message}</span>
                <span className="ml-auto text-muted-foreground">{m.status}</span>
              </li>
            ))}
            {!messages.data?.length ? <li className="text-muted-foreground">Nenhuma mensagem registrada.</li> : null}
          </ul>
        </Card>
      </main>
    </div>
  );
}
