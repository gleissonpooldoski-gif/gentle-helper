import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppSidebar } from "@/components/app-sidebar";
import { supabase } from "@/integrations/supabase/client";
import { getSiteConfig, saveSiteConfig, type SiteConfigDTO } from "@/modules/site/site.functions";

export const Route = createFileRoute("/site")({
  head: () => ({
    meta: [
      { title: "Configuração do Site — DvLinks" },
      { name: "description", content: "Personalize seu site DvLinks: título, logo, tag Google Analytics, cor do tema e encaminhamento de links." },
      { property: "og:title", content: "Configuração do Site — DvLinks" },
      { property: "og:description", content: "Central de personalização do seu site DvLinks." },
    ],
  }),
  component: SitePage,
});

const MAX_LOGO_SIZE = 500;
const PUBLIC_HOST = "https://dvlinks.com.br";

function SitePage() {
  const fetchCfg = useServerFn(getSiteConfig);
  const saveCfg = useServerFn(saveSiteConfig);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cfg, setCfg] = useState<SiteConfigDTO | null>(null);
  const [logoFileName, setLogoFileName] = useState<string | null>(null);
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
      toast.success("Configurações salvas com sucesso!");
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
      setLogoFileName(file.name);
      toast.success("Logo enviada. Clique em Salvar Configurações para confirmar.");
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

  const siteUrl = `${PUBLIC_HOST}/g/${cfg.slug}`;

  return (
    <div className="flex min-h-screen w-full bg-[var(--background)]">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-10 lg:py-14">
          <h1 className="mb-8 font-display text-2xl font-bold tracking-tight text-foreground">
            Configuração do Site
          </h1>

          <div className="space-y-6">
            {/* Bloco 1 — Meu site DvLinks */}
            <Block title="Meu site DvLinks">
              <input
                type="text"
                readOnly
                value={siteUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-lg border border-border/70 bg-muted px-3 py-2 text-sm text-foreground outline-none"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Exemplo: https://dvlinks.com.br/g/mundo-fitness-promo-6a12ca7ab3f70
              </p>
            </Block>

            {/* Bloco 2 — Título do Site */}
            <Block title="Título do Site">
              <input
                type="text"
                value={cfg.title}
                onChange={(e) => patch({ title: e.target.value })}
                maxLength={120}
                placeholder="Meu Site DvLinks"
                className="w-full rounded-lg border border-border/70 bg-card px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </Block>

            {/* Bloco 3 — Logo do Site */}
            <Block title="Logo do Site">
              <p className="mb-3 text-sm text-muted-foreground">
                Logo do Site (máximo 500 x 500 px)
              </p>
              <div className="flex items-center gap-4">
                <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-xl border border-border/70 bg-muted">
                  {cfg.logoUrl ? (
                    <img src={cfg.logoUrl} alt="Preview da logo" className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-xs text-muted-foreground">Sem logo</span>
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
                    {uploading ? "Enviando..." : "Escolher arquivo"}
                  </button>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {logoFileName
                      ? `Arquivo: ${logoFileName}`
                      : cfg.logoUrl
                        ? "Logo atual carregada."
                        : "Nenhum arquivo selecionado."}
                  </p>
                </div>
              </div>
            </Block>

            {/* Bloco 4 — Opções de utilização */}
            <Block title="Opções de utilização dos links">
              <div className="space-y-3">
                <Checkbox
                  label="Usar meu site no link do post (AMAZON / MERCADO LIVRE)"
                  checked={cfg.useForAmazonMl}
                  onChange={(v) => patch({ useForAmazonMl: v })}
                />
                <Checkbox
                  label="Usar meu site no link de todas as Lojas"
                  checked={cfg.useForAll}
                  onChange={(v) => patch({ useForAll: v })}
                />
              </div>
            </Block>

            {/* Bloco 5 — Título do site (secundário / subtítulo) */}
            <Block title="Título do site">
              <input
                type="text"
                value={cfg.subtitle}
                onChange={(e) => patch({ subtitle: e.target.value })}
                maxLength={160}
                placeholder="Título exibido no site"
                className="w-full rounded-lg border border-border/70 bg-card px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </Block>

            {/* Bloco 6 — TAG GOOGLE ANALYTICS */}
            <Block title="TAG GOOGLE ANALYTICS">
              <input
                type="text"
                value={cfg.gaTag ?? ""}
                onChange={(e) => patch({ gaTag: e.target.value })}
                placeholder="G-XXXXXXXXXX"
                className="w-full rounded-lg border border-border/70 bg-card px-3 py-2 text-sm font-mono outline-none focus:border-primary"
              />
              <p className="mt-2 text-xs text-muted-foreground">Exemplo: G-XXXXXXXXXX</p>
            </Block>

            {/* Bloco 7 — Cores */}
            <Block title="Cores">
              <p className="mb-3 text-sm font-medium text-foreground">Cor do Tema do SITE</p>
              <div className="flex items-center gap-4">
                <div
                  className="h-12 w-12 rounded-lg border border-border/70 shadow-sm"
                  style={{ backgroundColor: cfg.themeColor }}
                  aria-label="Cor atual"
                />
                <div className="flex flex-1 items-center gap-2">
                  <input
                    type="color"
                    value={cfg.themeColor}
                    onChange={(e) => patch({ themeColor: e.target.value })}
                    className="h-11 w-14 cursor-pointer rounded-lg border border-border/70 bg-transparent"
                    aria-label="Alterar cor"
                  />
                  <input
                    type="text"
                    value={cfg.themeColor}
                    onChange={(e) => patch({ themeColor: e.target.value })}
                    className="flex-1 rounded-lg border border-border/70 bg-card px-3 py-2 text-sm font-mono outline-none focus:border-primary"
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Cor atual: <span className="font-mono">{cfg.themeColor}</span>
              </p>
            </Block>

            {/* Botão final */}
            <div className="pt-4">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="w-full rounded-xl bg-primary px-5 py-3 text-sm font-bold uppercase tracking-wide text-primary-foreground shadow-sm hover:brightness-110 disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Salvar Configurações"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 cursor-pointer rounded border-border/70 text-primary focus:ring-primary"
      />
      <span className="text-sm text-foreground">{label}</span>
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
