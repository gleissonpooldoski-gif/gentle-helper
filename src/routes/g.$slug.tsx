/**
 * Site público por grupo/canal:
 *   /g/:slug           → vitrine do grupo
 *   /g/:slug/r?to=URL  → redireciona para o link original
 */
import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type PublicProduct = {
  id: string;
  title: string;
  imageUrl: string | null;
  price: number | null;
  originalPrice: number | null;
  link: string;
  store: string | null;
};

type PublicSite = {
  slug: string;
  title: string;
  subtitle: string | null;
  logoUrl: string | null;
  gaTag: string | null;
  themeColor: string;
  products: PublicProduct[];
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
      .select("slug, title, subtitle, logo_url, ga_tag, theme_color, channel_id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!row) return null;

    const { data: prods } = await client
      .from("products")
      .select("id, title, image_url, promo_price, original_price, affiliate_link, raw_link, store_name")
      .eq("channel_id", (row as { channel_id: string }).channel_id)
      .eq("availability", "ACTIVE")
      .order("created_at", { ascending: false })
      .limit(60);

    return {
      slug: row.slug as string,
      title: row.title as string,
      subtitle: (row as { subtitle?: string | null }).subtitle ?? null,
      logoUrl: (row.logo_url as string | null) ?? null,
      gaTag: (row.ga_tag as string | null) ?? null,
      themeColor: (row.theme_color as string) ?? "#3B82F6",
      products: (prods ?? []).map((p) => ({
        id: p.id as string,
        title: p.title as string,
        imageUrl: (p.image_url as string | null) ?? null,
        price: (p.promo_price as number | null) ?? null,
        originalPrice: (p.original_price as number | null) ?? null,
        link: (p.affiliate_link as string) || (p.raw_link as string),
        store: (p.store_name as string | null) ?? null,
      })),
    };
  });

export const Route = createFileRoute("/g/$slug")({
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
      { property: "og:description", content: loaderData?.subtitle ?? "Ofertas selecionadas" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ...(loaderData?.logoUrl
        ? [
            { property: "og:image", content: loaderData.logoUrl },
            { name: "twitter:image", content: loaderData.logoUrl },
          ]
        : []),
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

function fmtPrice(v: number | null): string | null {
  if (v == null) return null;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function PublicSitePage() {
  const site = Route.useLoaderData();
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
    <div className="min-h-screen bg-gray-50">
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
      <header className="px-6 py-10 text-center" style={{ backgroundColor: site.themeColor }}>
        {site.logoUrl && (
          <img
            src={site.logoUrl}
            alt={site.title}
            className="mx-auto mb-4 h-24 w-24 rounded-2xl object-cover shadow-lg"
          />
        )}
        <h1 className="text-3xl font-bold text-white drop-shadow">{site.title}</h1>
        {site.subtitle && <p className="mt-2 text-white/90">{site.subtitle}</p>}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {site.products.length === 0 ? (
          <p className="text-center text-gray-500">Nenhum produto disponível no momento.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {site.products.map((p: PublicProduct) => (
              <a
                key={p.id}
                href={p.link}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="group flex flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5 transition hover:shadow-md"
              >
                <div className="aspect-square w-full overflow-hidden bg-gray-100">
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={p.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-xs text-gray-400">
                      sem imagem
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <p className="line-clamp-2 text-sm font-medium text-gray-800">{p.title}</p>
                  <div className="mt-auto">
                    {fmtPrice(p.originalPrice) && p.originalPrice !== p.price && (
                      <p className="text-xs text-gray-400 line-through">{fmtPrice(p.originalPrice)}</p>
                    )}
                    {fmtPrice(p.price) && (
                      <p className="text-base font-bold" style={{ color: site.themeColor }}>
                        {fmtPrice(p.price)}
                      </p>
                    )}
                    {p.store && <p className="text-[10px] uppercase tracking-wide text-gray-400">{p.store}</p>}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </main>

      <footer className="py-6 text-center text-xs text-gray-400">
        Powered by DvLinks · /g/{site.slug}
      </footer>
    </div>
  );
}
