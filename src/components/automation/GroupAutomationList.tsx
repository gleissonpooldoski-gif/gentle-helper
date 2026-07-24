import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, Users } from "lucide-react";
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
 * Renderiza uma lista de cards, um por grupo selecionado do canal. Cada
 * "Editar" abre o modal com AutomationPanel escopado por (channelId, groupId)
 * — nunca reaproveita a config de outro grupo.
 */
export function GroupAutomationList({ channelId }: { channelId: string }) {
  const listFn = useServerFn(listAutomationGroups);
  const [groups, setGroups] = useState<AutomationGroupDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<AutomationGroupDTO | null>(null);

  useEffect(() => {
    // Ao trocar de canal: descarta grupos, modal aberto e erro do canal anterior.
    // Impede que estado local ou dados de listagem vazem entre canais.
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
        Nenhum grupo selecionado em <b>DIVULGA LINKS</b>. Selecione grupos na aba WhatsApp para configurar automações independentes.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-border/70 bg-card p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Automação por grupo
          </p>
          <span className="text-[11px] text-muted-foreground">{groups.length} grupo(s)</span>
        </div>
        <ul className="space-y-2">
          {groups.map((g, i) => (
            <li
              key={g.groupId}
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-background p-3"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-[11px] font-bold text-primary">
                G{i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-foreground">
                  Grupo {i + 1}
                </p>
                <p className="truncate text-[11.5px] text-muted-foreground" title={g.groupName ?? g.groupId}>
                  {g.groupName ?? g.groupId}
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
              key={open.groupId}
              channelId={channelId}
              groupId={open.groupId}
              groupName={open.groupName}
              title="Configuração deste grupo"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
