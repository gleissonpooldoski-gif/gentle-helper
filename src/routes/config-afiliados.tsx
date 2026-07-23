import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getShopeeConfig, saveShopeeConfig } from "@/lib/shopee-config.functions";
import { getMLConnection, saveMLConnection } from "@/modules/affiliate/mercado-livre/controller.functions";
import {
  getMLIntegrationStatus,
  startMLOAuth,
  disconnectMLIntegration,
} from "@/modules/affiliate/mercado-livre/oauth.functions";
import { getMagaluConnection, saveMagaluConnection } from "@/modules/affiliate/magalu/controller.functions";


import {
  AlertTriangle,
  BadgeCheck,
  Chrome,
  ExternalLink,
  HelpCircle,
  Info,
  KeyRound,
  Save,
  ShieldCheck,
  Sparkles,
  Store,
} from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar";
import { SHOPEE_STORAGE_KEYS } from "@/lib/shopee-affiliate";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/config-afiliados")({
  head: () => ({
    meta: [
      { title: "Configurações de Afiliados — DivulgaLinks" },
      {
        name: "description",
        content:
          "Configure suas contas e chaves de API de afiliados para Shopee, Mercado Livre, Amazon, Magalu, AliExpress e Awin.",
      },
      { property: "og:title", content: "Configurações de Afiliados — DivulgaLinks" },
      {
        property: "og:description",
        content:
          "Central única para configurar suas plataformas de afiliados e gerar links comissionados automaticamente.",
      },
    ],
  }),
  component: ConfigAfiliadosPage,
});

/* -------------------------------------------------------------------------- */
/*                                   Layout                                   */
/* -------------------------------------------------------------------------- */

function ConfigAfiliadosPage() {
  return (
    <div className="flex min-h-screen w-full bg-[var(--background)]">
      <AppSidebar activeId="afiliados" />
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <Header />
          <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
            <ShopeeCard />
            <MercadoLivreCard />
            <AmazonCard />
            <MagaluCard />
            <AliExpressCard />
            <AwinCard />
          </div>
        </div>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Header                                   */
/* -------------------------------------------------------------------------- */

function Header() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
          <ShieldCheck className="h-3.5 w-3.5" />
          Central de Integrações
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[color:var(--foreground)] sm:text-3xl">
          Configurações de Afiliados
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[color:var(--muted-foreground)]">
          Conecte seus programas de afiliados para gerar links comissionados
          automaticamente em todas as suas publicações.
        </p>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-2 text-xs font-medium text-[color:var(--muted-foreground)] shadow-sm">
        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
        Suas chaves ficam criptografadas e nunca são compartilhadas.
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Building blocks                               */
/* -------------------------------------------------------------------------- */

type Accent = "orange" | "yellow" | "amber" | "blue" | "red" | "pink" | "emerald";

const ACCENT_BG: Record<Accent, string> = {
  orange: "bg-orange-500",
  yellow: "bg-yellow-400",
  amber: "bg-amber-500",
  blue: "bg-blue-600",
  red: "bg-red-600",
  pink: "bg-pink-500",
  emerald: "bg-emerald-500",
};

function PlatformCard({
  accent,
  logo,
  title,
  subtitle,
  status,
  children,
}: {
  accent: Accent;
  logo: React.ReactNode;
  title: string;
  subtitle: string;
  status?: { label: string; tone: "active" | "pending" | "off" };
  children: React.ReactNode;
}) {
  return (
    <section className="group relative overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] shadow-sm transition hover:shadow-md">
      <span
        className={cn("absolute inset-x-0 top-0 h-1", ACCENT_BG[accent])}
        aria-hidden
      />
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--border)] p-5">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm",
              ACCENT_BG[accent],
            )}
          >
            {logo}
          </div>
          <div>
            <h2 className="text-base font-semibold text-[color:var(--foreground)]">
              {title}
            </h2>
            <p className="text-xs text-[color:var(--muted-foreground)]">
              {subtitle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status ? <StatusBadge label={status.label} tone={status.tone} /> : null}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[color:var(--muted)]/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] transition hover:bg-[color:var(--muted)]"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            Dúvidas? Clique aqui
          </button>
        </div>
      </header>
      <div className="space-y-5 p-5">{children}</div>
    </section>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "active" | "pending" | "off";
}) {
  const toneClass =
    tone === "active"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "pending"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-red-50 text-red-700 border-red-200";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        toneClass,
      )}
    >
      <BadgeCheck className="h-3 w-3" />
      {label}
    </span>
  );
}

function Field({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-[color:var(--foreground)]">
        {label}
        {hint ? (
          <span className="text-[10px] font-normal text-[color:var(--muted-foreground)]">
            {hint}
          </span>
        ) : null}
      </span>
      <input
        {...props}
        className={cn(
          "block w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm text-[color:var(--foreground)] shadow-inner outline-none transition placeholder:text-[color:var(--muted-foreground)]/60",
          "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
        )}
      />
    </label>
  );
}

function SaveButton({
  children = "Salvar configurações",
  onClick,
}: {
  children?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
    >
      <Save className="h-4 w-4" />
      {children}
    </button>
  );
}

function Alert({
  tone,
  title,
  children,
}: {
  tone: "info" | "warning" | "danger";
  title: string;
  children: React.ReactNode;
}) {
  const toneMap = {
    info: {
      wrap: "border-blue-200 bg-blue-50 text-blue-900",
      icon: <Info className="h-4 w-4 text-blue-600" />,
    },
    warning: {
      wrap: "border-amber-200 bg-amber-50 text-amber-900",
      icon: <AlertTriangle className="h-4 w-4 text-amber-600" />,
    },
    danger: {
      wrap: "border-red-200 bg-red-50 text-red-900",
      icon: <AlertTriangle className="h-4 w-4 text-red-600" />,
    },
  }[tone];
  return (
    <div className={cn("flex gap-3 rounded-xl border p-3.5 text-sm", toneMap.wrap)}>
      <div className="mt-0.5">{toneMap.icon}</div>
      <div>
        <p className="text-[13px] font-semibold">{title}</p>
        <div className="mt-1 text-[13px] leading-relaxed opacity-90">{children}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Cards                                    */
/* -------------------------------------------------------------------------- */

function ShopeeCard() {
  const [shopeeId, setShopeeId] = useState("");
  const [shopeeApiKey, setShopeeApiKey] = useState("");
  const [hasStoredApiKey, setHasStoredApiKey] = useState(false);
  const [status, setStatus] = useState<"connected" | "pending" | "error">("pending");
  const [lastError, setLastError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadConfig = useServerFn(getShopeeConfig);
  const persistConfig = useServerFn(saveShopeeConfig);

  useEffect(() => {
    let alive = true;
    loadConfig()
      .then((cfg) => {
        if (!alive || !cfg) return;
        setShopeeId(cfg.affiliateId);
        setHasStoredApiKey(cfg.hasApiKey);
        setStatus(cfg.status);
        setLastError(cfg.lastError);
        setUpdatedAt(cfg.updatedAt);
        // Mirror to localStorage so downstream link builders work offline.
        localStorage.setItem(SHOPEE_STORAGE_KEYS.affiliateId, cfg.affiliateId);
      })
      .catch((err) => {
        console.error(err);
        // Silently ignore for unauthenticated preview; state stays "pending".
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [loadConfig]);

  const handleSaveShopee = async () => {
    if (!shopeeId.trim()) {
      toast.error("Informe o Shopee ID de Afiliado antes de salvar.");
      return;
    }
    setSaving(true);
    try {
      const trimmedApiKey = shopeeApiKey.trim();
      const result = await persistConfig({
        data: {
          affiliateId: shopeeId.trim(),
          apiKey: trimmedApiKey || undefined,
        },
      });
      setStatus(result.status);
      setHasStoredApiKey(result.hasApiKey);
      setLastError(result.lastError);
      setUpdatedAt(result.updatedAt);
      setShopeeApiKey("");
      localStorage.setItem(SHOPEE_STORAGE_KEYS.affiliateId, result.affiliateId);
      if (result.status === "error") {
        toast.error("Configuração salva com aviso", {
          description: result.lastError ?? "Não foi possível validar a API Key.",
        });
      } else {
        toast.success("Configurações da Shopee salvas!", {
          description: result.hasApiKey
            ? "ID e API Key salvos. Links serão gerados via API oficial quando possível."
            : "ID de afiliado salvo. Links serão gerados automaticamente no formato comissionado.",
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível salvar a configuração.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleClearApiKey = async () => {
    if (!shopeeId.trim()) return;
    setSaving(true);
    try {
      const result = await persistConfig({
        data: { affiliateId: shopeeId.trim(), clearApiKey: true },
      });
      setHasStoredApiKey(false);
      setStatus(result.status);
      setShopeeApiKey("");
      toast.success("API Key removida.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao remover.";
      toast.error("Falha ao remover API Key", { description: message });
    } finally {
      setSaving(false);
    }
  };

  const statusBadge =
    status === "connected"
      ? { label: "Conectado", tone: "active" as const }
      : status === "error"
        ? { label: "Erro", tone: "off" as const }
        : { label: "Pendente", tone: "pending" as const };

  return (
    <PlatformCard
      accent="orange"
      logo={<Store className="h-5 w-5" />}
      title="Afiliados Shopee"
      subtitle="Gere links comissionados automaticamente"
      status={statusBadge}
    >
      <Alert tone="warning" title="Não tem senha de API? Sem problemas!">
        Basta preencher apenas o <b>ID de Afiliado</b> — o sistema gerará
        automaticamente um link comissionado usando o gerador oficial da Shopee.
      </Alert>
      {status === "error" && lastError ? (
        <Alert tone="danger" title="Erro na integração">
          {lastError}
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="shopee-id"
          label="Shopee ID de Afiliado"
          placeholder="Ex: 18291049182"
          value={shopeeId}
          onChange={(e) => setShopeeId(e.target.value)}
          disabled={loading || saving}
        />
        <Field
          id="shopee-api"
          label="Senha API / API Key"
          hint={hasStoredApiKey ? "Salva · digite para substituir" : "Opcional"}
          placeholder={hasStoredApiKey ? "•••••••• (salva)" : "••••••••••••••••"}
          type="password"
          value={shopeeApiKey}
          onChange={(e) => setShopeeApiKey(e.target.value)}
          disabled={loading || saving}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <p className="text-xs text-[color:var(--muted-foreground)]">
          {updatedAt
            ? `Última atualização: ${new Date(updatedAt).toLocaleString("pt-BR")}`
            : "Ainda não configurado"}
        </p>
        <div className="flex items-center gap-2">
          {hasStoredApiKey ? (
            <button
              type="button"
              onClick={handleClearApiKey}
              disabled={saving}
              className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-xs font-medium text-[color:var(--muted-foreground)] hover:bg-[color:var(--muted)]/40 disabled:opacity-50"
            >
              Remover API Key
            </button>
          ) : null}
          <SaveButton onClick={handleSaveShopee}>
            {saving ? "Salvando…" : "Salvar Shopee"}
          </SaveButton>
        </div>
      </div>
    </PlatformCard>
  );
}


function MercadoLivreCard() {
  const [affiliateLink, setAffiliateLink] = useState("");
  const [cookie, setCookie] = useState("");
  const [hasStoredCookie, setHasStoredCookie] = useState(false);
  const [tag, setTag] = useState<string | null>(null);
  const [status, setStatus] = useState<"connected" | "pending" | "error" | "cookie_expired">(
    "pending",
  );
  const [lastError, setLastError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useServerFn(getMLConnection);
  const save = useServerFn(saveMLConnection);

  // ---- OAuth oficial Mercado Livre ------------------------------------
  const loadOAuth = useServerFn(getMLIntegrationStatus);
  const startOAuth = useServerFn(startMLOAuth);
  const disconnectOAuth = useServerFn(disconnectMLIntegration);
  const [oauth, setOauth] = useState<{
    connected: boolean;
    mlUserId: string | null;
    expiresAt: string | null;
    updatedAt: string | null;
  } | null>(null);
  const [oauthBusy, setOauthBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    loadOAuth()
      .then((s) => { if (alive) setOauth(s); })
      .catch(() => { /* preview / signed-out */ });
    // Toast do callback (?ml_connected / ?ml_error).
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.get("ml_connected") === "1") {
        toast.success("Conta Mercado Livre conectada!");
        url.searchParams.delete("ml_connected");
        window.history.replaceState({}, "", url.toString());
      }
      const err = url.searchParams.get("ml_error");
      if (err) {
        toast.error("Falha ao conectar Mercado Livre", { description: err });
        url.searchParams.delete("ml_error");
        window.history.replaceState({}, "", url.toString());
      }
    }
    return () => { alive = false; };
  }, [loadOAuth]);

  const handleConnectOAuth = async () => {
    setOauthBusy(true);
    try {
      const redirectUri = `${window.location.origin}/api/ml/callback`;
      const { authorizationUrl } = await startOAuth({ data: { redirectUri } });
      window.location.href = authorizationUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível iniciar OAuth.");
      setOauthBusy(false);
    }
  };

  const handleDisconnectOAuth = async () => {
    setOauthBusy(true);
    try {
      await disconnectOAuth();
      setOauth({ connected: false, mlUserId: null, expiresAt: null, updatedAt: null });
      toast.success("Conta Mercado Livre desconectada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao desconectar.");
    } finally {
      setOauthBusy(false);
    }
  };
  // ---------------------------------------------------------------------

  useEffect(() => {
    let alive = true;
    load()
      .then((cfg) => {
        if (!alive || !cfg) return;
        setAffiliateLink(cfg.affiliateLink);
        setHasStoredCookie(cfg.hasCookie);
        setTag(cfg.affiliateTag);
        setStatus(cfg.status);
        setLastError(cfg.lastError);
        setUpdatedAt(cfg.updatedAt);
      })
      .catch(() => {
        /* preview / signed-out */
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [load]);

  const handleSave = async () => {
    if (!affiliateLink.trim()) {
      toast.error("Cole o link de afiliado do Mercado Livre.");
      return;
    }
    setSaving(true);
    try {
      const result = await save({
        data: {
          affiliateLink: affiliateLink.trim(),
          cookie: cookie.trim() || undefined,
        },
      });
      setTag(result.affiliateTag);
      setHasStoredCookie(result.hasCookie);
      setStatus(result.status);
      setLastError(result.lastError);
      setUpdatedAt(result.updatedAt);
      setCookie("");
      if (result.status === "connected") {
        toast.success("Mercado Livre conectado!", {
          description: `Tag detectada: ${result.affiliateTag}`,
        });
      } else if (result.status === "cookie_expired") {
        toast.warning("Cookie expirado", {
          description: "Atualize seu cookie do Mercado Livre para continuar gerando links.",
        });
      } else {
        toast.warning("Configuração salva com pendências", {
          description: result.lastError ?? "Complete os campos para conectar.",
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar a configuração.");
    } finally {
      setSaving(false);
    }
  };

  const statusBadge =
    status === "connected"
      ? { label: "Conectado", tone: "active" as const }
      : status === "cookie_expired"
        ? { label: "Cookie expirado", tone: "off" as const }
        : status === "error"
          ? { label: "Erro", tone: "off" as const }
          : { label: "Pendente", tone: "pending" as const };

  return (
    <PlatformCard
      accent="yellow"
      logo={<Store className="h-5 w-5 text-blue-900" />}
      title="Afiliados Mercado Livre"
      subtitle="Captura de tag via extensão ou manual"
      status={statusBadge}
    >
      {/* OAuth oficial Mercado Livre */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Oficial · OAuth
            </span>
            <h3 className="mt-2 text-sm font-semibold text-emerald-950">
              Conectar conta Mercado Livre
            </h3>
            <p className="mt-1 text-xs text-emerald-900/80">
              Autorize sua conta para buscar produtos via API oficial. Tokens ficam
              criptografados no backend — nada é exposto no navegador.
            </p>
            {oauth?.connected ? (
              <p className="mt-2 text-[11px] text-emerald-900/80">
                Usuário ML: <b>{oauth.mlUserId ?? "—"}</b>
                {oauth.expiresAt ? (
                  <> · expira em {new Date(oauth.expiresAt).toLocaleString("pt-BR")}</>
                ) : null}
              </p>
            ) : null}
          </div>
          {oauth?.connected ? (
            <button
              type="button"
              onClick={handleDisconnectOAuth}
              disabled={oauthBusy}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
              Desconectar
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConnectOAuth}
              disabled={oauthBusy}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              <KeyRound className="h-4 w-4" />
              {oauthBusy ? "Redirecionando…" : "Conectar Mercado Livre"}
            </button>
          )}
        </div>
      </div>

      {/* Option 1 */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Recomendada
            </span>
            <h3 className="mt-2 text-sm font-semibold text-blue-950">
              Opção 1 · Extensão do Chrome
            </h3>
            <p className="mt-1 text-xs text-blue-900/80">
              Captura sua tag e cookies com 1 clique, sem precisar mexer no
              DevTools.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <Chrome className="h-4 w-4" />
            Instalar Extensão
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs">
          <span className="text-blue-900/70">Tag configurada:</span>
          <code className="rounded bg-blue-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-blue-900">
            {tag ?? "—"}
          </code>
          {tag ? <BadgeCheck className="ml-auto h-4 w-4 text-emerald-600" /> : null}
        </div>
      </div>

      {status === "cookie_expired" ? (
        <Alert tone="warning" title="Cookie expirado">
          Atualize seu cookie do Mercado Livre para continuar gerando links.
        </Alert>
      ) : null}
      {status === "error" && lastError ? (
        <Alert tone="danger" title="Erro na configuração">
          {lastError}
        </Alert>
      ) : null}

      {/* Option 2 */}
      <details className="rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)]/30 p-4" open={!tag}>
        <summary className="cursor-pointer text-sm font-semibold text-[color:var(--foreground)]">
          Opção 2 · Configuração manual
        </summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs text-[color:var(--muted-foreground)]">
          <li>Cole abaixo um link de afiliado gerado no painel do ML.</li>
          <li>Abra o DevTools (F12) → aba Application → Cookies.</li>
          <li>
            Copie o valor do cookie <code className="font-mono">c_uid</code> e
            cole no campo abaixo.
          </li>
        </ol>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            label="Link de afiliado"
            placeholder="https://mercadolivre.com/sec/..."
            value={affiliateLink}
            onChange={(e) => setAffiliateLink(e.target.value)}
            disabled={loading || saving}
          />
          <Field
            label="Cookie c_uid"
            hint={hasStoredCookie ? "Salvo · digite para substituir" : undefined}
            placeholder={hasStoredCookie ? "•••••••• (salvo)" : "Cole aqui o valor"}
            type="password"
            value={cookie}
            onChange={(e) => setCookie(e.target.value)}
            disabled={loading || saving}
          />
        </div>
      </details>

      <div className="flex items-center justify-between">
        <p className="text-xs text-[color:var(--muted-foreground)]">
          {updatedAt
            ? `Última atualização: ${new Date(updatedAt).toLocaleString("pt-BR")}`
            : "Ainda não configurado"}
        </p>
        <SaveButton onClick={handleSave}>
          {saving ? "Salvando…" : "Salvar Mercado Livre"}
        </SaveButton>
      </div>
    </PlatformCard>
  );
}


function AmazonCard() {
  return (
    <PlatformCard
      accent="amber"
      logo={<Store className="h-5 w-5" />}
      title="Afiliados Amazon"
      subtitle="Product Advertising API (PA-API 5)"
      status={{ label: "Pendente", tone: "pending" }}
    >
      <Alert tone="danger" title="Atenção! API da Amazon é obrigatória.">
        Sem as credenciais da PA-API não conseguimos consultar preços nem gerar
        links comissionados. Solicite acesso em <b>Associates Central → Ferramentas → PA-API</b>.
      </Alert>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Amazon Afiliado ID" placeholder="seusite-20" />
        <Field label="Amazon Access Key" placeholder="AKIA••••••••" />
        <Field
          label="Amazon Secret Key"
          placeholder="••••••••••••••••"
          type="password"
        />
      </div>
      <div className="flex items-center justify-between pt-1">
        <a
          href="#"
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
        >
          Como gerar minhas chaves? <ExternalLink className="h-3 w-3" />
        </a>
        <SaveButton>Salvar Amazon</SaveButton>
      </div>
    </PlatformCard>
  );
}

function MagaluCard() {
  const [storeName, setStoreName] = useState("");
  const [status, setStatus] = useState<"connected" | "pending">("pending");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useServerFn(getMagaluConnection);
  const save = useServerFn(saveMagaluConnection);

  useEffect(() => {
    let alive = true;
    load()
      .then((conn) => {
        if (!alive || !conn) return;
        setStoreName(conn.storeName);
        setStatus(conn.status === "connected" ? "connected" : "pending");
        setUpdatedAt(conn.updatedAt);
      })
      .catch(() => {
        /* The protected save will report authentication errors to the user. */
      });
    return () => {
      alive = false;
    };
  }, [load]);

  const handleSave = async () => {
    const trimmed = storeName.trim();
    if (!trimmed) {
      toast.error("Informe o nome da loja Magalu.");
      return;
    }
    setSaving(true);
    try {
      const conn = await save({ data: { storeName: trimmed } });
      setStoreName(conn.storeName);
      setStatus(conn.status === "connected" ? "connected" : "pending");
      setUpdatedAt(conn.updatedAt);
      toast.success("Loja configurada — links Magalu podem ser gerados.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao salvar configuração Magalu.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const statusBadge =
    status === "connected"
      ? { label: "Conectado", tone: "active" as const }
      : { label: "Pendente", tone: "pending" as const };

  return (
    <PlatformCard
      accent="blue"
      logo={<Store className="h-5 w-5" />}
      title="Afiliados Magalu"
      subtitle="Parceiro Magalu · nome da loja"
      status={statusBadge}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Magalu Nome da Loja"
          placeholder="segredopromocoes"
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          autoComplete="off"
        />
      </div>
      {status === "connected" ? (
        <Alert tone="info" title="✓ Loja configurada">
          Links Magalu podem ser gerados automaticamente usando{" "}
          <strong>{storeName}</strong>.
          {updatedAt ? (
            <span className="ml-1 text-[color:var(--muted-foreground)]">
              · atualizado em {new Date(updatedAt).toLocaleString("pt-BR")}
            </span>
          ) : null}
        </Alert>
      ) : (
        <Alert tone="warning" title="⚠ Configure seu nome de loja Magalu">
          Preencha o nome da sua loja para começar a gerar links comissionados.
        </Alert>
      )}
      <div className="flex justify-end">
        <SaveButton onClick={handleSave}>{saving ? "Salvando…" : "Salvar Magalu"}</SaveButton>
      </div>
    </PlatformCard>
  );
}

function AliExpressCard() {
  return (
    <PlatformCard
      accent="red"
      logo={<Store className="h-5 w-5" />}
      title="Afiliados AliExpress"
      subtitle="Portals · tracking id + app key"
      status={{ label: "Ativo", tone: "active" }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Tracking ID" placeholder="divulga_ali" />
        <Field label="App Key" placeholder="123456789" />
        <Field
          label="App Secret"
          placeholder="••••••••••••••••"
          type="password"
        />
      </div>
      <div className="flex justify-end">
        <SaveButton>Salvar AliExpress</SaveButton>
      </div>
    </PlatformCard>
  );
}

function AwinCard() {
  const [publisherId, setPublisherId] = useState("");
  return (
    <PlatformCard
      accent="pink"
      logo={<KeyRound className="h-5 w-5" />}
      title="Afiliados Awin"
      subtitle="Rede global de anunciantes"
      status={{ label: "Desconectado", tone: "off" }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Publisher ID"
          placeholder="Ex: 998877"
          value={publisherId}
          onChange={(e) => setPublisherId(e.target.value)}
        />
        <Field
          label="OAuth Token"
          placeholder="Bearer ••••••••"
          type="password"
        />
      </div>
      <div className="flex justify-end">
        <SaveButton>Salvar Awin</SaveButton>
      </div>
    </PlatformCard>
  );
}
