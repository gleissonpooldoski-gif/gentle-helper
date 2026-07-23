import { useEffect, useState } from "react";
import { QrCode, Monitor, X, MessageCircle, Copy, Check, Loader2 } from "lucide-react";

type Tab = "qr" | "web";

export interface CreatedSession {
  id: string;
  name: string;
  sessionKey: string;
  expiresAt: string;
}

export interface ConnectNewNumberModalProps {
  open: boolean;
  onClose: () => void;
  /** Creates the session on the server and returns the raw token (shown once). */
  onCreate: (data: { name: string; mode: Tab }) => Promise<CreatedSession>;
}

export function ConnectNewNumberModal({ open, onClose, onCreate }: ConnectNewNumberModalProps) {
  const [tab, setTab] = useState<Tab>("qr");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedSession | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setTab("qr");
      setName("");
      setBusy(false);
      setCreated(null);
      setCopied(false);
    }
  }, [open]);

  if (!open) return null;

  const canSubmit = name.trim().length > 0 && !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      setBusy(true);
      const c = await onCreate({ name: name.trim(), mode: tab });
      setCreated(c);
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.sessionKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between bg-emerald-700 px-5 py-4 text-white">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            <h2 className="text-base font-semibold">
              {created ? "Token de conexão" : "Conectar novo número"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 transition hover:bg-white/10"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!created ? (
          <>
            {/* Tabs */}
            <div className="flex gap-2 border-b border-border bg-muted/40 px-5 pt-4">
              <TabButton active={tab === "qr"} onClick={() => setTab("qr")} icon={<QrCode className="h-4 w-4" />}>
                QR / Código
              </TabButton>
              <TabButton active={tab === "web"} onClick={() => setTab("web")} icon={<Monitor className="h-4 w-4" />}>
                WhatsApp Web
              </TabButton>
            </div>

            {/* Body */}
            <div className="space-y-4 px-5 py-6">
              <div className="space-y-1.5">
                <label
                  htmlFor="wa-session-name"
                  className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Nome da sessão <span className="text-emerald-600">*</span>
                </label>
                <input
                  id="wa-session-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Promos, Meu Canal"
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                  autoFocus
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Ao gerar o token, você poderá copiá-lo e colar na extensão do Chrome
                para vincular o WhatsApp Web a esta sessão.
              </p>
            </div>

            {/* Footer */}
            <div className="border-t border-border bg-muted/30 px-5 py-4">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                {busy ? "Gerando token…" : "Gerar token de conexão"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-4 px-5 py-6">
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Token
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm">
                    {created.sessionKey}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Expira em {new Date(created.expiresAt).toLocaleString()}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
                <p className="mb-2 font-semibold">Como conectar</p>
                <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
                  <li>Abra o WhatsApp Web no Chrome</li>
                  <li>Abra a extensão DivulgaLinks</li>
                  <li>Cole o token acima</li>
                  <li>Clique em Conectar</li>
                </ol>
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Aguardando conexão pela extensão…
              </div>
            </div>

            <div className="border-t border-border bg-muted/30 px-5 py-4">
              <button
                type="button"
                onClick={onClose}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background text-sm font-semibold transition hover:bg-muted"
              >
                Fechar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px flex items-center gap-1.5 rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition ${
        active
          ? "border-emerald-600 bg-emerald-600 text-white"
          : "border-transparent bg-muted text-muted-foreground hover:bg-muted/70"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
