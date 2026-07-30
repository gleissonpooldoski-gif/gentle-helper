import { createFileRoute } from "@tanstack/react-router";
import { fetchWithTimeout, TIMEOUTS } from "@/lib/http-timeout";

/**
 * CORS-friendly image proxy so the client-side canvas can render remote product
 * photos (Shopee/Amazon/etc.) without tainting the canvas. Read-only, safe.
 */
export const Route = createFileRoute("/api/public/img-proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const target = url.searchParams.get("url");
        if (!target) return new Response("missing url", { status: 400 });
        let parsed: URL;
        try {
          parsed = new URL(target);
        } catch {
          return new Response("bad url", { status: 400 });
        }
        if (!/^https?:$/.test(parsed.protocol)) {
          return new Response("bad protocol", { status: 400 });
        }
        try {
          const res = await fetchWithTimeout(parsed.toString(), {
            headers: {
              "user-agent":
                "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36",
              accept: "image/*,*/*;q=0.8",
            },
          }, { timeoutMs: TIMEOUTS.media, label: "img-proxy" });
          if (!res.ok) return new Response("upstream " + res.status, { status: 502 });
          const buf = await res.arrayBuffer();
          const ct = res.headers.get("content-type") ?? "image/jpeg";
          return new Response(buf, {
            status: 200,
            headers: {
              "content-type": ct,
              "cache-control": "public, max-age=86400",
              "access-control-allow-origin": "*",
            },
          });
        } catch (e: any) {
          return new Response("proxy error: " + String(e?.message ?? e), { status: 502 });
        }
      },
    },
  },
});
