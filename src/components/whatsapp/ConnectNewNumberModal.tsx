import { useEffect, useState } from "react";
import { QrCode, Monitor, X, MessageCircle } from "lucide-react";

type Tab = "qr" | "web";

export interface ConnectNewNumberModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; mode: Tab }) => Promise<void> | void;
  busy?: boolean;
}

export function ConnectNewNumberModal({
  open,
  onClose,
  onSubmit,
  busy,
}: ConnectNewNumberModalProps) {
  const [tab, setTab] = useState<Tab>("qr");
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) {
      setTab("qr");
      setName("");
    }
  }, [open]);

  if (!open) return null;

  const canSubmit = name.trim().length > 0 && !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await onSubmit({ name: name.trim(), mode: tab });
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
            <h2 className="text-base font-semibold">Conectar novo número</h2>
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
            {tab === "qr"
              ? "Escaneie o QR Code com seu WhatsApp para conectar a sessão."
              : "Abra o WhatsApp Web na extensão para vincular esta sessão."}
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
            {tab === "qr" ? <QrCode className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
            {busy ? "Gerando…" : tab === "qr" ? "Gerar QR code" : "Conectar via WhatsApp Web"}
          </button>
        </div>
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
