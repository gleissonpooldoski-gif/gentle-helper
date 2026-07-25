import { useEffect, useMemo, useRef, useState } from "react";
import * as fabric from "fabric";
import { toast } from "sonner";
import {
  loadElements,
  serializeCanvas,
  newElement,
} from "@/modules/visual-templates/canvas";
import { FORMAT_SIZE, type VTElement, type VTFormat } from "@/modules/visual-templates/presets";
import type { ProductLite } from "@/modules/visual-templates/bindings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  Image as ImageIcon,
  Tag,
  Percent,
  Type,
  Star,
  Package,
  Store,
  ShoppingBag,
  Sparkles,
  Palette,
  Square,
  Download,
  Copy,
  Star as StarIcon,
  Save,
} from "lucide-react";

interface TemplateRow {
  id: string;
  name: string;
  format: string;
  elements: unknown;
  preview_url: string | null;
}

interface EditorProps {
  template: TemplateRow;
  products: ProductLite[];
  onSave: (patch: { name?: string; elements?: unknown[]; preview_url?: string | null }) => void;
  onDuplicate: () => void;
  onSetDefault: () => void;
  onBack: () => void;
}

const SIDEBAR = [
  { type: "product_image", label: "Imagem do Produto", icon: ImageIcon },
  { type: "price", label: "Preço", icon: Tag },
  { type: "discount", label: "Desconto", icon: Percent },
  { type: "text", label: "Título", icon: Type, bind: "{{title}}" },
  { type: "rating", label: "Avaliação", icon: Star },
  { type: "sold", label: "Vendidos", icon: Package },
  { type: "store", label: "Loja", icon: Store },
  { type: "buy_button", label: "Botão Comprar", icon: ShoppingBag },
  { type: "logo", label: "Logo", icon: Sparkles },
  { type: "free_text", label: "Texto Livre", icon: Type },
  { type: "background", label: "Fundo", icon: Palette },
  { type: "shape", label: "Forma", icon: Square },
] as const;

export function EditorClient({
  template,
  products,
  onSave,
  onDuplicate,
  onSetDefault,
  onBack,
}: EditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const [name, setName] = useState(template.name);
  const [productId, setProductId] = useState<string>("");
  const [selected, setSelected] = useState<fabric.Object | null>(null);
  const [dirty, setDirty] = useState(false);

  const format = template.format as VTFormat;
  const size = FORMAT_SIZE[format];
  const scale = 0.32;

  const product = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId],
  );

  // Init canvas
  useEffect(() => {
    if (!canvasRef.current) return;
    const c = new fabric.Canvas(canvasRef.current, {
      width: size.w,
      height: size.h,
      backgroundColor: "#ffffff",
      preserveObjectStacking: true,
    });
    c.setZoom(scale);
    c.setDimensions({ width: size.w * scale, height: size.h * scale });
    fabricRef.current = c;
    c.on("selection:created", (e) => setSelected(e.selected?.[0] ?? null));
    c.on("selection:updated", (e) => setSelected(e.selected?.[0] ?? null));
    c.on("selection:cleared", () => setSelected(null));
    c.on("object:modified", () => setDirty(true));
    c.on("object:added", () => setDirty(true));
    c.on("object:removed", () => setDirty(true));

    const initial = Array.isArray(template.elements) ? (template.elements as VTElement[]) : [];
    loadElements(c, initial, product);
    return () => {
      c.dispose();
      fabricRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload when product changes
  useEffect(() => {
    if (!fabricRef.current) return;
    const els = serializeCanvas(fabricRef.current, format);
    loadElements(fabricRef.current, els, product);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  // Auto-save (debounced)
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      if (!fabricRef.current) return;
      const elements = serializeCanvas(fabricRef.current, format);
      onSave({ name, elements });
      setDirty(false);
    }, 900);
    return () => clearTimeout(t);
  }, [dirty, name, format, onSave]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const c = fabricRef.current;
      if (!c) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        const active = c.getActiveObject();
        if (active && (e.target as HTMLElement)?.tagName !== "INPUT" && (e.target as HTMLElement)?.tagName !== "TEXTAREA") {
          c.remove(active);
          setSelected(null);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function addElement(type: VTElement["type"], bind?: string) {
    const c = fabricRef.current;
    if (!c) return;
    const el = newElement(type, format);
    if (bind) (el.props as Record<string, unknown>).bind = bind;
    const currentEls = serializeCanvas(c, format);
    loadElements(c, [...currentEls, el], product);
  }

  function updateSelectedProp(key: string, value: unknown) {
    if (!selected) return;
    const data = (selected as unknown as { data?: { props: Record<string, unknown> } }).data;
    if (!data) return;
    data.props[key] = value;
    // Apply live for text / fill
    if (key === "color" && "set" in selected) selected.set({ fill: value as string });
    if (key === "fill" && "set" in selected) selected.set({ fill: value as string });
    if (key === "size" && "set" in selected) selected.set({ fontSize: value as number });
    if (key === "text" && "set" in selected) (selected as unknown as { set: (v: object) => void }).set({ text: value });
    if (key === "font" && "set" in selected) selected.set({ fontFamily: value as string });
    if (key === "align" && "set" in selected) (selected as unknown as { set: (v: object) => void }).set({ textAlign: value });
    if (key === "weight" && "set" in selected) selected.set({ fontWeight: value as number });
    fabricRef.current?.renderAll();
    setDirty(true);
  }

  async function downloadPNG() {
    const c = fabricRef.current;
    if (!c) return;
    const prevZoom = c.getZoom();
    c.setZoom(1);
    c.setDimensions({ width: size.w, height: size.h });
    const url = c.toDataURL({ format: "png", multiplier: 1 });
    c.setZoom(prevZoom);
    c.setDimensions({ width: size.w * prevZoom, height: size.h * prevZoom });
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name || "template"}.png`;
    a.click();
  }

  function forceSave() {
    const c = fabricRef.current;
    if (!c) return;
    const prevZoom = c.getZoom();
    c.setZoom(0.3);
    c.setDimensions({ width: size.w * 0.3, height: size.h * 0.3 });
    const preview = c.toDataURL({ format: "png", multiplier: 1 });
    c.setZoom(prevZoom);
    c.setDimensions({ width: size.w * prevZoom, height: size.h * prevZoom });
    // Skip preview upload for now; store as data URL length is too large.
    void preview;
    const elements = serializeCanvas(c, format);
    onSave({ name, elements });
    setDirty(false);
    toast.success("Template salvo");
  }

  const selData = selected
    ? (selected as unknown as { data?: { type: VTElement["type"]; props: Record<string, unknown> } })
        .data
    : null;

  return (
    <div className="flex h-screen flex-col bg-muted/30">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b bg-background px-4 py-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
        </Button>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          className="max-w-xs"
        />
        <span className="text-xs text-muted-foreground">
          {dirty ? "Salvando..." : "Salvo automaticamente"}
        </span>
        <div className="flex-1" />
        <Select value={productId} onValueChange={setProductId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Pré-visualizar com produto..." />
          </SelectTrigger>
          <SelectContent>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.title?.slice(0, 40) ?? p.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={onDuplicate}>
          <Copy className="mr-1 h-4 w-4" /> Duplicar
        </Button>
        <Button variant="outline" size="sm" onClick={onSetDefault}>
          <StarIcon className="mr-1 h-4 w-4" /> Padrão
        </Button>
        <Button variant="outline" size="sm" onClick={downloadPNG}>
          <Download className="mr-1 h-4 w-4" /> PNG
        </Button>
        <Button size="sm" onClick={forceSave}>
          <Save className="mr-1 h-4 w-4" /> Salvar
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Elements sidebar */}
        <aside className="w-52 shrink-0 overflow-y-auto border-r bg-background p-3">
          <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Elementos
          </div>
          <div className="grid grid-cols-2 gap-2">
            {SIDEBAR.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={() => addElement(item.type, "bind" in item ? item.bind : undefined)}
                  className="flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition hover:border-primary hover:bg-primary/5"
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-center leading-tight">{item.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Canvas */}
        <main className="flex flex-1 items-center justify-center overflow-auto p-6">
          <div className="rounded-lg bg-white shadow-xl">
            <canvas ref={canvasRef} />
          </div>
        </main>

        {/* Properties panel */}
        <aside className="w-72 shrink-0 overflow-y-auto border-l bg-background p-4">
          <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Propriedades
          </div>
          {!selData ? (
            <p className="text-sm text-muted-foreground">
              Clique em um elemento para editar suas propriedades.
            </p>
          ) : (
            <PropertiesPanel data={selData} onChange={updateSelectedProp} />
          )}
        </aside>
      </div>
    </div>
  );
}

function PropertiesPanel({
  data,
  onChange,
}: {
  data: { type: VTElement["type"]; props: Record<string, unknown> };
  onChange: (key: string, value: unknown) => void;
}) {
  const { type, props } = data;

  if (["text", "free_text", "buy_button", "sold", "store", "rating"].includes(type)) {
    return (
      <div className="space-y-3">
        {!("bind" in props) && (
          <div>
            <Label>Texto</Label>
            <Input
              value={(props.text as string) ?? ""}
              onChange={(e) => onChange("text", e.target.value)}
            />
          </div>
        )}
        <div>
          <Label>Fonte</Label>
          <Select
            value={(props.font as string) ?? "Inter"}
            onValueChange={(v) => onChange("font", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                "Inter",
                "Poppins",
                "Bebas Neue",
                "Montserrat",
                "Oswald",
                "Anton",
                "Archivo Black",
                "Playfair Display",
                "Sora",
                "Manrope",
              ].map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tamanho</Label>
          <Input
            type="number"
            value={(props.size as number) ?? 40}
            onChange={(e) => onChange("size", Number(e.target.value))}
          />
        </div>
        <div>
          <Label>Peso</Label>
          <Select
            value={String((props.weight as number) ?? 700)}
            onValueChange={(v) => onChange("weight", Number(v))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[400, 600, 700, 800, 900].map((w) => (
                <SelectItem key={w} value={String(w)}>
                  {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Alinhamento</Label>
          <Select
            value={(props.align as string) ?? "left"}
            onValueChange={(v) => onChange("align", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Esquerda</SelectItem>
              <SelectItem value="center">Centro</SelectItem>
              <SelectItem value="right">Direita</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <ColorInput
          label="Cor"
          value={(props.color as string) ?? "#111111"}
          onChange={(v) => onChange("color", v)}
        />
      </div>
    );
  }

  if (type === "price") {
    return (
      <div className="space-y-3">
        <div>
          <Label>Formato</Label>
          <Select
            value={(props.mode as string) ?? "both"}
            onValueChange={(v) => onChange("mode", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="por">Apenas POR</SelectItem>
              <SelectItem value="de">Apenas DE</SelectItem>
              <SelectItem value="both">DE + POR</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <ColorInput
          label="Cor de fundo"
          value={(props.bg as string) ?? "#dc2626"}
          onChange={(v) => onChange("bg", v)}
        />
        <ColorInput
          label="Cor do texto"
          value={(props.color as string) ?? "#ffffff"}
          onChange={(v) => onChange("color", v)}
        />
        <div>
          <Label>Arredondamento</Label>
          <Input
            type="number"
            value={(props.radius as number) ?? 24}
            onChange={(e) => onChange("radius", Number(e.target.value))}
          />
        </div>
      </div>
    );
  }

  if (type === "shape" || type === "background") {
    return (
      <div className="space-y-3">
        <ColorInput
          label="Cor"
          value={(props.fill as string) ?? "#ffffff"}
          onChange={(v) => onChange("fill", v)}
        />
        {type === "shape" && (
          <div>
            <Label>Arredondamento</Label>
            <Input
              type="number"
              value={(props.radius as number) ?? 0}
              onChange={(e) => onChange("radius", Number(e.target.value))}
            />
          </div>
        )}
      </div>
    );
  }

  if (type === "image" || type === "logo") {
    return (
      <div className="space-y-3">
        <div>
          <Label>URL da imagem</Label>
          <Input
            value={(props.src as string) ?? ""}
            onChange={(e) => onChange("src", e.target.value)}
            placeholder="https://..."
          />
        </div>
      </div>
    );
  }

  if (type === "product_image") {
    return (
      <p className="text-sm text-muted-foreground">
        A imagem do produto é preenchida automaticamente quando você seleciona um produto.
      </p>
    );
  }

  if (type === "discount") {
    return (
      <div className="space-y-3">
        <div>
          <Label>Tamanho</Label>
          <Input
            type="number"
            value={(props.size as number) ?? 100}
            onChange={(e) => onChange("size", Number(e.target.value))}
          />
        </div>
        <ColorInput
          label="Cor"
          value={(props.color as string) ?? "#dc2626"}
          onChange={(v) => onChange("color", v)}
        />
      </div>
    );
  }

  return <p className="text-sm text-muted-foreground">Sem propriedades editáveis.</p>;
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-14 cursor-pointer rounded border"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}
