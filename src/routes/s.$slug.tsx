/**
 * Página pública do site DvLinks + endpoint de redirecionamento.
 *   /s/:slug           → landing personalizada
 *   /s/:slug/r?to=URL  → redireciona para o link original
 *
 * Como a rota é única (`/s/$slug`), tratamos o subcaminho `/r` via query param
 * `to` — o wrapper anexa `?to=` no path `${slug}/r`.
 */
import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type PublicSite = {
  slug: string;
  title: string;
  logoUrl: string | null;
  gaTag: string | null;
  themeColor: string;
};

const loadPublicSite = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => z.object({ slug: z.string().min(1) }).parse(data))
  .handler(async ({ data }): Promise<PublicSite | null> => {
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const url = process.env.SUPABASE_URL!;
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: row } = await client
      .from("site_configs")
      .select("slug, title, logo_url, ga_tag, theme_color")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!row) return null;
    return {
      slug: row.slug as string,
      title: row.title as string,
      logoUrl: (row.logo_url as string | null) ?? null,
      gaTag: (row.ga_tag as string | null) ?? null,
      themeColor: (row.theme_color as string) ?? "#3B82F6",
    };
  });

export const Route = createFileRoute("/s/$slug")({
  loader: async ({ params }) => {
    const site = await loadPublicSite({ data: { slug: params.slug } });
    if (!site) throw notFound();
    return site;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.title ?? "DvLinks" },
      { name: "description", content: `${loaderData?.title ?? "DvLinks"} — Ofertas selecionadas` },
      { property: "og:title", content: loaderData?.title ?? "DvLinks" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PublicSitePage,
  notFoundComponent: () => (
    <div className="grid min-h-screen place-items-center bg-gray-50 text-gray-700">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Site não encontrado</h1>
        <p className="mt-2 text-sm">Verifique o link e tente novamente.</p>
      </div>
    </div>
  ),
  errorComponent: ({ error, reset }) => (
    <div className="grid min-h-screen place-items-center bg-gray-50 text-gray-700">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Erro ao carregar</h1>
        <p className="mt-2 text-sm">{error.message}</p>
        <button onClick={reset} className="mt-4 rounded bg-black px-4 py-2 text-white">Tentar novamente</button>
      </div>
    </div>
  ),
});

function PublicSitePage() {
  const site = Route.useLoaderData();
  // Redirecionamento client-side quando `?to=` está presente.
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const to = params.get("to");
    if (to && /^https?:\/\//i.test(to)) {
      window.location.replace(to);
      return (
        <div className="grid min-h-screen place-items-center" style={{ backgroundColor: site.themeColor }}>
          <p className="text-white">Redirecionando...</p>
        </div>
      );
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: site.themeColor }}>
      {site.gaTag && (
        <>
          <script async src={`https://www.googletagmanager.com/gtag/js?id=${site.gaTag}`} />
          <script
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${site.gaTag}');`,
            }}
          />
        </>
      )}
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        {site.logoUrl && (
          <img
            src={site.logoUrl}
            alt={site.title}
            className="mx-auto mb-6 h-32 w-32 rounded-2xl object-cover shadow-lg"
          />
        )}
        <h1 className="text-3xl font-bold text-white drop-shadow">{site.title}</h1>
        <p className="mt-4 text-white/90">Confira as melhores ofertas selecionadas para você.</p>
      </div>
    </div>
  );
}
