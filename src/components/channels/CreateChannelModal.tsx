/**
 * Modal para criar um novo grupo/canal a partir do dashboard.
 * O grupo é criado 100% isolado (sem cópia de dados de outros grupos).
 * As configurações finais de plataformas, produtos, intervalo por grupo
 * e templates são gerenciadas na tela de edição do grupo.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RefreshCw, Plus } from "lucide-react";
import { createChannel, type ChannelDTO } from "@/modules/channels/channels.functions";

type Platform = "telegram" | "whatsapp" | "instagram" | "outros";

const PLATFORMS: { value: Platform; label: string; placeholder: string; needsId: boolean }[] = [
  { value: "telegram", label: "Telegram", placeholder: "@meu_canal ou -100123456", needsId: true },
  { value: "whatsapp", label: "WhatsApp", placeholder: "ID do grupo (opcional)", needsId: false },
  { value: "instagram", label: "Instagram", placeholder: "@usuario (opcional)", needsId: false },
  { value: "outros", label: "Outros", placeholder: "ID externo (opcional)", needsId: false },
];

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (channel: ChannelDTO) => void;
};

export function CreateChannelModal({ open, onClose, onCreated }: Props) {
  const createFn = useServerFn(createChannel);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<Platform>("telegram");
  const [externalId, setExternalId] = useState("");
  const [intervalMin, setIntervalMin] = useState("30");
  const [autoPost, setAutoPost] = useState(true);
  const [randomOrder, setRandomOrder] = useState(false);

  const platformCfg = PLATFORMS.find((p) => p.value === platform)!;

  const reset = () => {
    setName("");
    setPlatform("telegram");
    setExternalId("");
    setIntervalMin("30");
    setAutoPost(true);
    setRandomOrder(false);
  };

  const handleClose = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Informe o nome do grupo.");
      return;
    }
    if (platformCfg.needsId && !externalId.trim()) {
      toast.error("Informe o ID do canal para a plataforma selecionada.");
      return;
    }
    setSaving(true);
    try {
      const created = await createFn({
        data: {
          name: name.trim(),
          externalId: externalId.trim() || null,
          autoPost,
          intervalMin: Number(intervalMin) || 30,
          randomOrder,
        },
      });
      toast.success("Grupo criado.");
      onCreated(created);
      reset();
    } catch (err) {
      toast.error("Não foi possível criar o grupo.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? handleClose() : null)}>
      <DialogContent className="w-[min(560px,95vw)] max-w-none">
        <DialogHeader>
          <DialogTitle>Adicionar novo grupo</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Nome do grupo
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Ofertas Relâmpago"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Plataforma
            </label>
            <div className="grid grid-cols-4 gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPlatform(p.value)}
                  className={`rounded-md border px-2 py-2 text-xs font-semibold transition-colors ${
                    platform === p.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              ID do canal/grupo{platformCfg.needsId ? "" : " (opcional)"}
            </label>
            <Input
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder={platformCfg.placeholder}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Intervalo (min)
              </label>
              <Input
                type="number"
                min={1}
                max={1440}
                value={intervalMin}
                onChange={(e) => setIntervalMin(e.target.value)}
              />
            </div>
            <div className="space-y-2 pt-5">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoPost}
                  onChange={(e) => setAutoPost(e.target.checked)}
                />
                Publicação automática ativa
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={randomOrder}
                  onChange={(e) => setRandomOrder(e.target.checked)}
                />
                Ordem aleatória
              </label>
            </div>
          </div>

          <p className="rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground">
            Após criar, use <span className="font-semibold">Editar</span> para adicionar produtos,
            grupos de destino, template e histórico — todos exclusivos deste grupo.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar grupo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
