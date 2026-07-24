/**
 * Vitrine pública por grupo/canal (template dinâmico):
 *   /g/:slug           → vitrine
 *   /g/:slug/r?to=URL  → redirecionamento
 */
import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { z } from "zod";

type PublicProduct = {
  id: string;
  title: string;
  imageUrl: string | null;
  price: number | null;
  originalPrice: number | null;
  link: string;
  platform: string | null;
  createdAt: string | null;
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

const PLATFORM_LABEL: Record<string, string> = {
  shopee: "Shopee",
  mercadolivre: "Mercado Livre",
  amazon: "Amazon",
  aliexpress: "AliExpress",
  magalu: "Magalu",
};

function normalizePlatform(raw: string | null, link: string | null): string | null {
  const p = (raw ?? "").toLowerCase().trim();
  if (p && PLATFORM_LABEL[p]) return p;
  const host = (() => {
    try { return link ? new URL(link).hostname.toLowerCase() : ""; } catch { return ""; }
  })();
  if (/shopee|shope\.ee/.test(host)) return "shopee";
  if (/mercadoli(vre|bre)|mlb\./.test(host)) return "mercadolivre";
  if (/amazon|amzn\.to/.test(host)) return "amazon";
  if (/aliexpress/.test(host)) return "aliexpress";
  if (/magalu|magazineluiza|magazinevoce/.test(host)) return "magalu";
  return null;
}

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
      .select("slug, title, subtitle, logo_url, ga_tag, theme_color, channel_id, platforms, sort_order, product_limit")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!row) return null;

    const cfg = row as Record<string, unknown>;
    const channelId = cfg.channel_id as string;
    const platforms = (cfg.platforms as string[] | null) ?? ["shopee", "mercadolivre", "amazon"];
    const sortOrder = ((cfg.sort_order as string | null) ?? "recent") as "recent" | "best" | "random";
    const limit = Math.min(200, Math.max(1, (cfg.product_limit as number | null) ?? 60));

    let query = client
      .from("products")
      .select("id, title, image_url, promo_price, original_price, affiliate_link, raw_link, platform, sales, created_at")
      .eq("channel_id", channelId)
      .eq("availability", "ACTIVE");

    if (platforms.length > 0) query = query.in("platform", platforms);

    if (sortOrder === "best") query = query.order("sales", { ascending: false, nullsFirst: false });
    else query = query.order("created_at", { ascending: false });

    const { data: prods } = await query.limit(sortOrder === "random" ? 200 : limit);

    let list = (prods ?? []).map((p) => {
      const link = ((p.affiliate_link as string) || (p.raw_link as string)) ?? "";
      return {
        id: p.id as string,
        title: p.title as string,
        imageUrl: (p.image_url as string | null) ?? null,
        price: (p.promo_price as number | null) ?? null,
        originalPrice: (p.original_price as number | null) ?? null,
        link,
        platform: normalizePlatform((p.platform as string | null) ?? null, link),
        createdAt: (p.created_at as string | null) ?? null,
      };
    });

    if (sortOrder === "random") {
      list = list.sort(() => Math.random() - 0.5).slice(0, limit);
    }

    return {
      slug: row.slug as string,
      title: row.title as string,
      subtitle: (row as { subtitle?: string | null }).subtitle ?? null,
      logoUrl: (row.logo_url as string | null) ?? null,
      gaTag: (row.ga_tag as string | null) ?? null,
      themeColor: (row.theme_color as string) ?? "#3B82F6",
      products: list,
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

function fmtDate(v: string | null): string | null {
  if (!v) return null;
  try {
    return new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return null;
  }
}

function PublicSitePage() {
  const site = Route.useLoaderData();
  const [q, setQ] = useState("");

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

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return site.products;
    return site.products.filter((p: PublicProduct) => p.title.toLowerCase().includes(t));
  }, [q, site.products]);

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
        <div className="mx-auto mt-6 max-w-xl">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar produtos..."
            className="w-full rounded-full border-0 bg-white/95 px-5 py-3 text-sm text-gray-800 shadow-md outline-none focus:ring-2 focus:ring-white/60"
          />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {filtered.length === 0 ? (
          <p className="text-center text-gray-500">Nenhum produto encontrado.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((p: PublicProduct) => (
              <article
                key={p.id}
                className="group flex flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5 transition hover:shadow-md"
              >
                <div className="relative aspect-square w-full overflow-hidden bg-gray-100">
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={p.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-xs text-gray-400">sem imagem</div>
                  )}
                  {p.platform && (
                    <span
                      className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow"
                      style={{ backgroundColor: site.themeColor }}
                    >
                      {PLATFORM_LABEL[p.platform] ?? p.platform}
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <p className="line-clamp-2 text-sm font-medium text-gray-800">{p.title}</p>
                  <div className="mt-auto space-y-1">
                    {fmtPrice(p.originalPrice) && p.originalPrice !== p.price && (
                      <p className="text-xs text-gray-400 line-through">{fmtPrice(p.originalPrice)}</p>
                    )}
                    {fmtPrice(p.price) && (
                      <p className="text-base font-bold" style={{ color: site.themeColor }}>
                        {fmtPrice(p.price)}
                      </p>
                    )}
                    {fmtDate(p.createdAt) && (
                      <p className="text-[10px] text-gray-400">Publicado em {fmtDate(p.createdAt)}</p>
                    )}
                    <a
                      href={p.link}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      className="mt-2 block w-full rounded-lg py-2 text-center text-xs font-bold uppercase tracking-wide text-white transition hover:brightness-110"
                      style={{ backgroundColor: site.themeColor }}
                    >
                      Comprar
                    </a>
                  </div>
                </div>
              </article>
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
