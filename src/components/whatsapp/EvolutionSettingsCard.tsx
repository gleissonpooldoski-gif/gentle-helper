import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getEvolutionSettings,
  saveEvolutionSettings,
  testEvolutionConnection,
} from "@/modules/whatsapp/evolution/settings.functions";

type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

export function EvolutionSettingsCard() {
  const getFn = useServerFn(getEvolutionSettings);
  const saveFn = useServerFn(saveEvolutionSettings);
  const testFn = useServerFn(testEvolutionConnection);

  const [open, setOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: "idle" });

  const load = useCallback(async () => {
    try {
      const s = await getFn();
      setBaseUrl(s.baseUrl);
      setUpdatedAt(s.updatedAt);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }, [getFn]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const s = await saveFn({ data: { baseUrl } });
      setBaseUrl(s.baseUrl);
      setUpdatedAt(s.updatedAt);
      toast.success("URL salva");
      // Auto-testa após salvar
      void handleTest(s.baseUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (urlOverride?: string) => {
    setTest({ kind: "testing" });
    try {
      const r = await testFn({ data: { baseUrl: urlOverride ?? baseUrl } });
      setTest(r.ok ? { kind: "ok", message: r.message } : { kind: "error", message: r.message });
    } catch (err) {
      setTest({
        kind: "error",
        message: err instanceof Error ? err.message : "Falha no teste",
      });
    }
  };

  const badge =
    test.kind === "ok"
      ? { text: "Conectado", cls: "bg-emerald-100 text-emerald-800" }
      : test.kind === "error"
        ? { text: "Falha", cls: "bg-red-100 text-red-800" }
        : test.kind === "testing"
          ? { text: "Testando…", cls: "bg-amber-100 text-amber-800" }
          : { text: "Não testado", cls: "bg-muted text-muted-foreground" };

  return (
    <div className="mb-4 rounded-xl border border-border/60 bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2 text-sm"
      >
        <span className="flex items-center gap-2 font-medium">
          <Settings2 className="h-4 w-4" /> Configuração Evolution API
        </span>
        <span className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${badge.cls}`}>
            {badge.text}
          </span>
          <span className="text-xs text-muted-foreground">{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-border/60 p-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <>
              <label className="block text-xs font-medium text-muted-foreground">
                URL pública (ex.: https://xxxxx.trycloudflare.com)
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://sua-tunel.trycloudflare.com"
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <Button size="sm" onClick={handleSave} disabled={saving || !baseUrl.trim()}>
                  {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Salvar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTest()}
                  disabled={test.kind === "testing"}
                >
                  {test.kind === "testing" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Testar conexão
                </Button>
              </div>
              {test.kind !== "idle" && test.kind !== "testing" && (
                <p
                  className={`text-xs ${
                    test.kind === "ok" ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {test.message}
                </p>
              )}
              {updatedAt && (
                <p className="text-[11px] text-muted-foreground">
                  Última atualização: {new Date(updatedAt).toLocaleString()}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
