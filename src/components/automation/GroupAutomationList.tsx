import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, Users, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listAutomationGroups,
  type AutomationGroupDTO,
} from "@/modules/automation/automation.functions";
import { AutomationPanel } from "./AutomationPanel";

/**
 * Lista grupos agrupados por instância WhatsApp. Cada WhatsApp conectado
 * aparece como um bloco com os grupos que o usuário selecionou naquele
 * número. Cada "Editar" abre o AutomationPanel escopado por (canal, grupo)
 * e pré-vinculado à instância correta.
 */
export function GroupAutomationList({ channelId }: { channelId: string }) {
  const listFn = useServerFn(listAutomationGroups);
  const [groups, setGroups] = useState<AutomationGroupDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<AutomationGroupDTO | null>(null);

  useEffect(() => {
    setGroups(null);
    setOpen(null);
    setError(null);
    let cancelled = false;
    (async () => {
      try {
        const g = await listFn({ data: { channelId } });
        if (!cancelled) setGroups(g);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar grupos");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const grouped = useMemo(() => {
    const map = new Map<string, { instanceName: string; instancePhone: string | null; instanceStatus: string | null; items: AutomationGroupDTO[] }>();
    for (const g of groups ?? []) {
      const cur = map.get(g.instanceId);
      if (cur) cur.items.push(g);
      else map.set(g.instanceId, {
        instanceName: g.instanceName,
        instancePhone: g.instancePhone,
        instanceStatus: g.instanceStatus,
        items: [g],
      });
    }
    return Array.from(map.entries());
  }, [groups]);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-[13px] text-red-700">
        {error}
      </div>
    );
  }
  if (groups === null) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando grupos…
      </div>
    );
  }
  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
        Nenhum grupo selecionado ainda. Vá na aba <b>WhatsApp</b>, escolha um número conectado e marque os grupos que ele deve enviar — eles aparecerão aqui automaticamente.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {grouped.map(([instanceId, block]) => (
          <div key={instanceId} className="rounded-2xl border border-border/70 bg-card p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/15 text-emerald-600">
                  <Smartphone className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-foreground">
                    {block.instancePhone ?? block.instanceName}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {block.instanceName}
                    {block.instanceStatus === "connected" ? " · ✅ Conectado" : ""}
                  </p>
                </div>
              </div>
              <span className="text-[11px] text-muted-foreground">{block.items.length} grupo(s)</span>
            </div>
            <ul className="space-y-2">
              {block.items.map((g, i) => (
                <li
                  key={`${g.instanceId}:${g.groupId}`}
                  className="flex items-center gap-3 rounded-xl border border-border/60 bg-background p-3"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-[11px] font-bold text-primary">
                    G{i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-foreground" title={g.groupName ?? g.groupId}>
                      {g.groupName ?? g.groupId}
                    </p>
                    <p className="truncate text-[11.5px] text-muted-foreground">
                      Automação independente
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setOpen(g)}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              {open ? `Automação — ${open.groupName ?? open.groupId}` : "Automação"}
            </DialogTitle>
          </DialogHeader>
          {open && (
            <AutomationPanel
              key={`${channelId}:${open.instanceId}:${open.groupId}`}
              channelId={channelId}
              groupId={open.groupId}
              groupName={open.groupName}
              instanceId={open.instanceId}
              title={`Configuração — ${open.instanceName}`}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
