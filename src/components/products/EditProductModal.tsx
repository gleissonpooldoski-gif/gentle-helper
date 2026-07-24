/**
 * Modal para editar um produto importado.
 * Carrega dados reais do banco pelo (platform, itemId) ou pelo id UUID
 * e persiste alterações via updateProduct. Chama onSaved com o produto
 * atualizado para o card/lista reagir imediatamente.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RefreshCw, Save } from "lucide-react";
import {
  getProductForEdit,
  updateProduct,
  type EditableProductDTO,
} from "@/modules/products/product-edit.functions";

export type EditProductTarget =
  | { kind: "byId"; id: string }
  | { kind: "byItem"; platform: string; itemId: string };

type Props = {
  open: boolean;
  channelId: string;
  target: EditProductTarget | null;
  onClose: () => void;
  onSaved: (product: EditableProductDTO) => void;
};


const AVAILABILITY_LABELS: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  out_of_stock: "Sem estoque",
  error: "Erro de validação",
  unknown: "Não verificado",
};

function parsePriceInput(v: string): number | null {
  const t = v.trim().replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function formatPriceInput(v: number | null): string {
  if (v == null) return "";
  return v.toFixed(2).replace(".", ",");
}

export function EditProductModal({ open, channelId, target, onClose, onSaved }: Props) {
  const getFn = useServerFn(getProductForEdit);
  const saveFn = useServerFn(updateProduct);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [product, setProduct] = useState<EditableProductDTO | null>(null);
  const [notFound, setNotFound] = useState(false);

  // form state
  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [rawLink, setRawLink] = useState("");
  const [affiliateLink, setAffiliateLink] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [promoPrice, setPromoPrice] = useState("");
  const [description, setDescription] = useState("");
  const [availability, setAvailability] = useState<EditableProductDTO["availability"]>("unknown");

  useEffect(() => {
    if (!open || !target) return;
    let cancelled = false;
    setProduct(null);
    setNotFound(false);
    setLoading(true);
    const args =
      target.kind === "byId"
        ? { data: { channelId, id: target.id } }
        : { data: { channelId, platform: target.platform, itemId: target.itemId } };

    getFn(args)
      .then((p) => {
        if (cancelled) return;
        if (!p) {
          setNotFound(true);
          return;
        }
        setProduct(p);
        setTitle(p.title);
        setImageUrl(p.image_url ?? "");
        setRawLink(p.raw_link);
        setAffiliateLink(p.affiliate_link);
        setOriginalPrice(formatPriceInput(p.original_price));
        setPromoPrice(formatPriceInput(p.promo_price));
        setDescription(p.category ?? "");
        setAvailability(p.availability);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error("Falha ao carregar produto", {
          description: err instanceof Error ? err.message : undefined,
        });
        onClose();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, target, channelId, getFn, onClose]);

  const handleSave = async () => {
    if (!product) return;
    if (!title.trim()) {
      toast.error("Informe o nome do produto.");
      return;
    }
    setSaving(true);
    try {
      const updated = await saveFn({
        data: {
          channelId,
          id: product.id,
          title: title.trim(),
          image_url: imageUrl.trim() || null,
          raw_link: rawLink.trim(),
          affiliate_link: affiliateLink.trim(),
          original_price: parsePriceInput(originalPrice),
          promo_price: parsePriceInput(promoPrice),
          category: description.trim() || null,
          availability,
        },
      });
      onSaved({ ...updated, linkedGroups: product.linkedGroups });
      toast.success("Produto atualizado.");
      onClose();
    } catch (err) {
      toast.error("Não foi possível salvar as alterações.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="max-h-[90vh] w-[min(720px,95vw)] max-w-none overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar produto</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" /> Carregando dados do produto...
          </div>
        ) : notFound ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Este produto ainda não foi salvo no banco. Importe pela planilha ou adicione pelo link
            para poder editar.
          </div>
        ) : product ? (
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="h-32 w-32 shrink-0 overflow-hidden rounded-md border bg-muted/40">
                {imageUrl ? (
                  <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-3xl text-muted-foreground">
                    🛍️
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Nome do produto
                  </label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    URL da imagem
                  </label>
                  <Input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Link do produto
                </label>
                <Input value={rawLink} onChange={(e) => setRawLink(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Link afiliado
                </label>
                <Input
                  value={affiliateLink}
                  onChange={(e) => setAffiliateLink(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Preço original (R$)
                </label>
                <Input
                  value={originalPrice}
                  onChange={(e) => setOriginalPrice(e.target.value)}
                  placeholder="29,90"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Preço atual (R$)
                </label>
                <Input
                  value={promoPrice}
                  onChange={(e) => setPromoPrice(e.target.value)}
                  placeholder="14,90"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Descrição / categoria
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Plataforma
                </label>
                <Input value={product.platform} disabled />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Data de importação
                </label>
                <Input
                  value={new Date(product.created_at).toLocaleString("pt-BR")}
                  disabled
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </label>
                <select
                  value={availability}
                  onChange={(e) =>
                    setAvailability(e.target.value as EditableProductDTO["availability"])
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {Object.entries(AVAILABILITY_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Grupos vinculados
              </label>
              {product.linkedGroups.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">
                  Nenhum grupo com esta plataforma nas automações ativas.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {product.linkedGroups.map((g) => (
                    <span
                      key={g}
                      className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-[11px]"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading || !product}
            className="gap-2"
          >
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
