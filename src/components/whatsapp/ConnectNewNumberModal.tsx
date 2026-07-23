import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { QrCode, X, MessageCircle, Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { getWhatsAppSessionStatus, type WASessionStatus } from "@/modules/channels/whatsapp/sessions.functions";

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
  onCreate: (data: { name: string }) => Promise<CreatedSession>;
  /** Called when the session becomes connected (for parent list refresh). */
  onConnected?: (sessionId: string) => void;
}

export function ConnectNewNumberModal({ open, onClose, onCreate, onConnected }: ConnectNewNumberModalProps) {
  const statusFn = useServerFn(getWhatsAppSessionStatus);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedSession | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<WASessionStatus>("pending");
  const [expired, setExpired] = useState(false);
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setBusy(false);
      setCreated(null);
      setQrDataUrl(null);
      setStatus("pending");
      setExpired(false);
      notifiedRef.current = false;
    }
  }, [open]);

  // Generate QR image from the token
  useEffect(() => {
    if (!created) return;
    QRCode.toDataURL(created.sessionKey, {
      width: 260,
      margin: 1,
      color: { dark: "#065f46", light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [created]);

  // Poll status
  useEffect(() => {
    if (!created || !open) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await statusFn({ data: { sessionId: created.id } });
        if (cancelled) return;
        setStatus(s.status);
        if (s.expiresAt && new Date(s.expiresAt).getTime() < Date.now() && s.status !== "connected") {
          setExpired(true);
        }
        if (s.status === "connected" && !notifiedRef.current) {
          notifiedRef.current = true;
          onConnected?.(created.id);
        }
      } catch {
        /* ignore transient */
      }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [created, open, statusFn, onConnected]);

  if (!open) return null;

  const canSubmit = name.trim().length > 0 && !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      setBusy(true);
      const c = await onCreate({ name: name.trim() });
      setCreated(c);
      setStatus("pending");
    } finally {
      setBusy(false);
    }
  };

  const handleRestart = () => {
    setCreated(null);
    setQrDataUrl(null);
    setStatus("pending");
    setExpired(false);
    notifiedRef.current = false;
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
              {created ? "Escaneie o QR Code" : "Conectar novo número"}
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
                Um QR Code será gerado para vincular o WhatsApp a esta sessão.
              </p>
            </div>

            <div className="border-t border-border bg-muted/30 px-5 py-4">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                {busy ? "Gerando QR Code…" : "Gerar QR Code"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-4 px-5 py-6">
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-xl border border-border bg-white p-3 shadow-sm">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="QR Code de conexão" width={260} height={260} />
                  ) : (
                    <div className="flex h-[260px] w-[260px] items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                    </div>
                  )}
                </div>

                <StatusPill status={expired ? "disconnected" : status} expired={expired} />

                {!expired && status !== "connected" && (
                  <p className="text-center text-xs text-muted-foreground">
                    Aguardando leitura do QR Code…
                  </p>
                )}
                {status === "connected" && (
                  <p className="flex items-center gap-1.5 text-center text-sm font-semibold text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" /> WhatsApp conectado com sucesso!
                  </p>
                )}
                {expired && status !== "connected" && (
                  <p className="text-center text-xs text-destructive">
                    QR Code expirado. Gere um novo para tentar novamente.
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2 border-t border-border bg-muted/30 px-5 py-4">
              <button
                type="button"
                onClick={handleRestart}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-background text-sm font-semibold transition hover:bg-muted"
              >
                <RefreshCw className="h-4 w-4" /> Novo QR
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                {status === "connected" ? "Concluir" : "Fechar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status, expired }: { status: WASessionStatus; expired: boolean }) {
  const map: Record<WASessionStatus, { label: string; cls: string }> = {
    pending: { label: "Aguardando", cls: "bg-amber-100 text-amber-800" },
    connecting: { label: "Conectando…", cls: "bg-blue-100 text-blue-800" },
    connected: { label: "Conectado", cls: "bg-emerald-100 text-emerald-800" },
    disconnected: { label: expired ? "Expirado" : "Desconectado", cls: "bg-muted text-muted-foreground" },
  };
  const s = map[status];
  return (
    <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${s.cls}`}>
      {s.label}
    </span>
  );
}
