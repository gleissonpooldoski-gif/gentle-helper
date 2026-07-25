import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getInstagramAdminSettings,
  saveInstagramAdminSettings,
  testInstagramAdminConnection,
} from "@/modules/instagram-admin/admin.functions";
import { InstagramLayout } from "./instagram";
import { Loader2 } from "lucide-react";

function Page() {
  const qc = useQueryClient();
  const load = useServerFn(getInstagramAdminSettings);
  const save = useServerFn(saveInstagramAdminSettings);
  const test = useServerFn(testInstagramAdminConnection);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["ig-admin", "settings"],
    queryFn: () => load(),
  });

  const [igId, setIgId] = useState("");
  const [pageId, setPageId] = useState("");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "ok"; info: any }
    | { kind: "err"; text: string }
  >({ kind: "idle" });

  useEffect(() => {
    if (settings) {
      setIgId(settings.instagramBusinessId);
      setPageId(settings.facebookPageId);
    }
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: () =>
      save({ data: { instagramBusinessId: igId, facebookPageId: pageId, accessToken: token } }),
    onSuccess: () => {
      toast.success("Configuração salva");
      setToken("");
      qc.invalidateQueries({ queryKey: ["ig-admin", "settings"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  const testMut = useMutation({
    mutationFn: async () => {
      if (token && igId) {
        return test({
          data: { instagramBusinessId: igId, facebookPageId: pageId, accessToken: token },
        });
      }
      return test({ data: { useSaved: true } });
    },
    onSuccess: (r: any) => {
      setStatus({ kind: "ok", info: r.info });
      toast.success("Instagram conectado");
    },
    onError: (e: any) => {
      setStatus({ kind: "err", text: e?.message ?? "Falha na conexão" });
      toast.error(e?.message ?? "Falha na conexão");
    },
  });

  return (
    <InstagramLayout>
      <div className="max-w-2xl space-y-4 rounded-2xl border border-border/70 bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Configurações da conta</h2>
          {settings?.hasToken && (
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600">
              Token salvo
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <>
            <Field
              label="Instagram Business ID"
              value={igId}
              onChange={setIgId}
              placeholder="17841400000000000"
            />
            <Field
              label="Facebook Page ID"
              value={pageId}
              onChange={setPageId}
              placeholder="10000000000000"
            />
            <Field
              label="Access Token"
              value={token}
              onChange={setToken}
              placeholder={settings?.hasToken ? "•••••• (deixe em branco para manter)" : "EAAG..."}
              type="password"
            />

            {status.kind === "err" && (
              <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                🔴 {status.text}
              </div>
            )}

            {status.kind === "ok" && <StatusPanel info={status.info} igId={igId} />}

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => testMut.mutate()}
                disabled={testMut.isPending || (!token && !settings?.hasToken)}
                className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                {testMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Testar conexão
              </button>
              <button
                type="button"
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending || !igId || !pageId || !token}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar Configuração
              </button>
            </div>
          </>
        )}
      </div>
    </InstagramLayout>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />
    </label>
  );
}

function StatusPanel({ info, igId }: { info: any; igId: string }) {
  const cap = info?.capabilities ?? { stories: true, comments: true, messages: true };
  const dot = (ok: boolean) => (ok ? "🟢" : "🔴");
  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground text-right">{value}</span>
    </div>
  );
  return (
    <div className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="text-sm font-semibold text-emerald-700">🟢 Instagram conectado</div>
      <div className="space-y-1.5">
        <Row label="Conta" value={info?.username ? `@${info.username}` : "—"} />
        <Row label="Instagram Business ID" value={igId || "—"} />
        <Row label="Facebook Page" value={info?.pageName ?? "—"} />
        <Row label="Webhook" value={`${dot(!!info?.webhookActive)} ${info?.webhookActive ? "Ativo" : "Inativo"}`} />
        <Row label="Stories" value={`${dot(cap.stories)} ${cap.stories ? "Disponível" : "Indisponível"}`} />
        <Row label="Comentários" value={`${dot(cap.comments)} ${cap.comments ? "Disponível" : "Indisponível"}`} />
        <Row label="Mensagens" value={`${dot(cap.messages)} ${cap.messages ? "Disponível" : "Indisponível"}`} />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/instagram/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações do Instagram · DivulgaLinks" },
      { name: "description", content: "Conecte a conta Instagram do administrador via Meta Graph API." },
    ],
  }),
  component: Page,
});
