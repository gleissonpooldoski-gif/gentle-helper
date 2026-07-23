import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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

function SaveButton({ children = "Salvar configurações" }: { children?: React.ReactNode }) {
  return (
    <button
      type="button"
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
  return (
    <PlatformCard
      accent="orange"
      logo={<Store className="h-5 w-5" />}
      title="Afiliados Shopee"
      subtitle="Gere links comissionados automaticamente"
      status={{ label: "Ativo", tone: "active" }}
    >
      <Alert tone="warning" title="Não tem senha de API? Sem problemas!">
        Basta preencher apenas o <b>ID de Afiliado</b> — o sistema gerará
        automaticamente um link comissionado usando o gerador oficial da Shopee.
      </Alert>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Shopee ID de Afiliado" placeholder="Ex: 18291049182" />
        <Field
          label="Senha API / API Key"
          hint="Opcional"
          placeholder="••••••••••••••••"
          type="password"
        />
      </div>
      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-[color:var(--muted-foreground)]">
          Última sincronização: há 3 minutos
        </p>
        <SaveButton>Salvar Shopee</SaveButton>
      </div>
    </PlatformCard>
  );
}

function MercadoLivreCard() {
  return (
    <PlatformCard
      accent="yellow"
      logo={<Store className="h-5 w-5 text-blue-900" />}
      title="Afiliados Mercado Livre"
      subtitle="Captura de tag via extensão ou manual"
      status={{ label: "Tag configurada", tone: "active" }}
    >
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
            gc20241201082726
          </code>
          <BadgeCheck className="ml-auto h-4 w-4 text-emerald-600" />
        </div>
      </div>

      {/* Option 2 */}
      <details className="rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)]/30 p-4">
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
          <Field label="Link de afiliado" placeholder="https://mercadolivre.com/sec/..." />
          <Field label="Cookie c_uid" placeholder="Cole aqui o valor" />
        </div>
      </details>

      <div className="flex justify-end">
        <SaveButton>Salvar Mercado Livre</SaveButton>
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
  return (
    <PlatformCard
      accent="blue"
      logo={<Store className="h-5 w-5" />}
      title="Afiliados Magalu"
      subtitle="Parceiro Magalu · captura de subtag"
      status={{ label: "Ativo", tone: "active" }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Magalu Partner ID" placeholder="magalupartner_xxx" />
        <Field label="Subtag padrão" placeholder="divulgalinks" />
      </div>
      <div className="flex justify-end">
        <SaveButton>Salvar Magalu</SaveButton>
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
