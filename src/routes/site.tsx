import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Globe, Image as ImageIcon, Palette, Save, LineChart, Link2 } from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar";
import { supabase } from "@/integrations/supabase/client";
import { getSiteConfig, saveSiteConfig, type SiteConfigDTO } from "@/modules/site/site.functions";

export const Route = createFileRoute("/site")({
  head: () => ({
    meta: [
      { title: "Configuração do Site — DivulgaLinks" },
      { name: "description", content: "Personalize o seu site DvLinks: logo, título, cor do tema, tag do Google Analytics e como os links dos posts são encaminhados." },
      { property: "og:title", content: "Configuração do Site — DivulgaLinks" },
      { property: "og:description", content: "Central de personalização do seu site DvLinks." },
    ],
  }),
  component: SitePage,
});

const MAX_LOGO_SIZE = 500;

function SitePage() {
  const fetchCfg = useServerFn(getSiteConfig);
  const saveCfg = useServerFn(saveSiteConfig);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cfg, setCfg] = useState<SiteConfigDTO | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCfg()
      .then((c) => setCfg(c))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  }, [fetchCfg]);

  function patch(part: Partial<SiteConfigDTO>) {
    setCfg((prev) => (prev ? { ...prev, ...part } : prev));
  }

  async function handleSave() {
    if (!cfg) return;
    setSaving(true);
    try {
      const saved = await saveCfg({ data: cfg });
      setCfg(saved);
      toast.success("Configurações do site salvas!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }
    // Valida dimensões 500x500 máx.
    const dims = await readImageDimensions(file);
    if (dims.width > MAX_LOGO_SIZE || dims.height > MAX_LOGO_SIZE) {
      toast.error(`Logo deve ter no máximo ${MAX_LOGO_SIZE}x${MAX_LOGO_SIZE}px (atual: ${dims.width}x${dims.height}).`);
      return;
    }
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sessão expirada.");
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
      const path = `${userData.user.id}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("site-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage.from("site-logos").getPublicUrl(path);
      patch({ logoUrl: signed.publicUrl });
      toast.success("Logo enviada. Clique em Salvar para confirmar.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar logo.");
    } finally {
      setUploading(false);
    }
  }

  if (loading || !cfg) {
    return (
      <div className="flex min-h-screen w-full bg-[var(--background)]">
        <AppSidebar />
        <main className="flex-1 p-8 text-muted-foreground">Carregando...</main>
      </div>
    );
  }

  const siteUrl = typeof window !== "undefined" ? `${window.location.origin}/s/${cfg.slug}` : `/s/${cfg.slug}`;

  return (
    <div className="flex min-h-screen w-full bg-[var(--background)]">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-10 lg:py-14">
          <header className="mb-8">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Configuração do Site</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Personalize seu site DvLinks e defina como os links dos posts devem ser encaminhados.
            </p>
          </header>

          <div className="space-y-6">
            {/* Meu site DvLinks */}
            <Card icon={<Link2 className="h-4 w-4" />} title="Meu site DvLinks">
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Link personalizado
              </label>
              <div className="mt-1.5 flex items-stretch overflow-hidden rounded-lg border border-border/70 bg-card">
                <span className="grid place-items-center border-r border-border/70 bg-muted px-3 text-sm text-muted-foreground">
                  {typeof window !== "undefined" ? `${window.location.host}/s/` : "/s/"}
                </span>
                <input
                  type="text"
                  value={cfg.slug}
                  onChange={(e) => patch({ slug: e.target.value })}
                  className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
                  placeholder="meu-site"
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                URL pública: <a href={siteUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">{siteUrl}</a>
              </p>
            </Card>

            {/* Título */}
            <Card icon={<Globe className="h-4 w-4" />} title="Título do Site">
              <input
                type="text"
                value={cfg.title}
                onChange={(e) => patch({ title: e.target.value })}
                maxLength={120}
                className="w-full rounded-lg border border-border/70 bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                placeholder="Meu Site DvLinks"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Exibido no topo da página e como título da aba do navegador.
              </p>
            </Card>

            {/* Logo */}
            <Card icon={<ImageIcon className="h-4 w-4" />} title="Logo do Site">
              <div className="flex items-center gap-4">
                <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-xl border border-border/70 bg-muted">
                  {cfg.logoUrl ? (
                    <img src={cfg.logoUrl} alt="Logo" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleLogoUpload(f);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                    className="rounded-lg border border-border/70 bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                  >
                    {uploading ? "Enviando..." : "Enviar imagem"}
                  </button>
                  {cfg.logoUrl && (
                    <button
                      type="button"
                      onClick={() => patch({ logoUrl: null })}
                      className="ml-2 rounded-lg border border-border/70 bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
                    >
                      Remover
                    </button>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Máximo {MAX_LOGO_SIZE}x{MAX_LOGO_SIZE}px. PNG, JPG, WebP ou SVG.
                  </p>
                </div>
              </div>
            </Card>

            {/* Opções */}
            <Card icon={<Link2 className="h-4 w-4" />} title="Opções de encaminhamento">
              <Toggle
                label="Usar meu site no link do post (AMAZON / MERCADO LIVRE)"
                description="Links da Amazon e do Mercado Livre passarão pelo seu site DvLinks."
                checked={cfg.useForAmazonMl}
                onChange={(v) => patch({ useForAmazonMl: v })}
              />
              <div className="mt-3">
                <Toggle
                  label="Usar meu site no link de todas as lojas"
                  description="Qualquer link de produto será encaminhado pelo seu site DvLinks."
                  checked={cfg.useForAll}
                  onChange={(v) => patch({ useForAll: v })}
                />
              </div>
            </Card>

            {/* GA */}
            <Card icon={<LineChart className="h-4 w-4" />} title="TAG Google Analytics">
              <input
                type="text"
                value={cfg.gaTag ?? ""}
                onChange={(e) => patch({ gaTag: e.target.value })}
                placeholder="G-XXXXXXXXXX"
                className="w-full rounded-lg border border-border/70 bg-card px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Inserida automaticamente no seu site DvLinks (formato G-XXXXXX ou UA-XXXXXX).
              </p>
            </Card>

            {/* Cor */}
            <Card icon={<Palette className="h-4 w-4" />} title="Cor do Tema do SITE">
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={cfg.themeColor}
                  onChange={(e) => patch({ themeColor: e.target.value })}
                  className="h-11 w-16 cursor-pointer rounded-lg border border-border/70 bg-transparent"
                />
                <input
                  type="text"
                  value={cfg.themeColor}
                  onChange={(e) => patch({ themeColor: e.target.value })}
                  className="flex-1 rounded-lg border border-border/70 bg-card px-3 py-2 text-sm font-mono outline-none focus:border-primary"
                />
              </div>
            </Card>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-110 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar configurações"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">{icon}</span>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
      <span className="flex-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
      </span>
    </label>
  );
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Falha ao ler imagem"));
    };
    img.src = url;
  });
}
