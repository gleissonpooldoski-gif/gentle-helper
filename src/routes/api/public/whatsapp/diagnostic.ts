import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/whatsapp/diagnostic")({
  server: {
    handlers: {
      GET: async () => {
        const { getEvolutionConfig } = await import("@/modules/whatsapp/evolution/client.server");
        const cfg = await getEvolutionConfig();
        const rawUrl = cfg.baseUrl;
        const apiKey = cfg.apiKey;
        const hasKey = apiKey.length > 0;
        let host = "";
        try {
          host = new URL(rawUrl).host;
        } catch {
          host = rawUrl;
        }
        const baseUrl = rawUrl.replace(/\/+$/, "");
        const headers = { apikey: apiKey };

        const result: Record<string, unknown> = {
          evolution_host: host,
          evolution_url_configured: !!rawUrl,
          evolution_api_key_configured: hasKey,
        };

        // 1) fetchInstances
        try {
          const res = await fetch(`${baseUrl}/instance/fetchInstances`, { headers });
          const text = await res.text();
          let parsed: any = null;
          try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 500); }
          const arr: any[] = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.instances)
              ? parsed.instances
              : [];
          const names = arr.map((i) => i?.name ?? i?.instance?.instanceName ?? i?.instanceName ?? i?.instance?.name).filter(Boolean);
          target = names[0] ? String(names[0]) : target;
          result.fetchInstances = {
            status: res.status,
            count: arr.length,
            names,
            raw_preview: typeof parsed === "string" ? parsed : undefined,
          };
        } catch (e: any) {
          result.fetchInstances = { error: e?.message ?? String(e) };
        }

        // 2) connectionState da instância alvo
        try {
          const res = await fetch(`${baseUrl}/instance/connectionState/${encodeURIComponent(target)}`, { headers });
          const text = await res.text();
          let parsed: any = null;
          try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 500); }
          result.connectionState = { status: res.status, body: parsed };
        } catch (e: any) {
          result.connectionState = { error: e?.message ?? String(e) };
        }

        // 3) fetchAllGroups da instância alvo
        try {
          const res = await fetch(
            `${baseUrl}/group/fetchAllGroups/${encodeURIComponent(target)}?getParticipants=false`,
            { headers },
          );
          const text = await res.text();
          let parsed: any = null;
          try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 500); }
          const arr: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.groups) ? parsed.groups : [];
          result.fetchAllGroups = {
            status: res.status,
            count: arr.length,
            sample: arr.slice(0, 3).map((g) => ({
              jid: g?.id ?? g?.jid ?? g?.remoteJid,
              subject: g?.subject ?? g?.name,
              size: g?.size ?? (Array.isArray(g?.participants) ? g.participants.length : null),
            })),
          };
        } catch (e: any) {
          result.fetchAllGroups = { error: e?.message ?? String(e) };
        }

        // 4) webhook/find
        try {
          const res = await fetch(`${baseUrl}/webhook/find/${encodeURIComponent(target)}`, { headers });
          const text = await res.text();
          let parsed: any = null;
          try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 500); }
          result.webhook = { status: res.status, body: parsed };
        } catch (e: any) {
          result.webhook = { error: e?.message ?? String(e) };
        }

        return new Response(JSON.stringify(result, null, 2), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
