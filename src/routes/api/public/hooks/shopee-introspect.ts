import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/public-auth.server";
import { createDecipheriv, createHash } from "node:crypto";

function encKey(): Buffer {
  return createHash("sha256").update(process.env.SHOPEE_CONFIG_ENC_KEY!).digest();
}
function decrypt(encoded: string): string {
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), ct = buf.subarray(28);
  const d = createDecipheriv("aes-256-gcm", encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}
async function gql(appId: string, secret: string, query: string) {
  const payload = JSON.stringify({ query });
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHash("sha256").update(appId + ts + payload + secret).digest("hex");
  const r = await fetch("https://open-api.affiliate.shopee.com.br/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `SHA256 Credential=${appId}, Timestamp=${ts}, Signature=${sig}`,
    },
    body: payload,
  });
  return await r.text();
}

export const Route = createFileRoute("/api/public/hooks/shopee-introspect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFail = requireCronSecret(request);
        if (authFail) return authFail;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin
          .from("affiliate_connections")
          .select("affiliate_id, api_key_encrypted")
          .eq("platform", "shopee")
          .not("api_key_encrypted", "is", null)
          .limit(1)
          .maybeSingle();
        if (!row?.affiliate_id || !row.api_key_encrypted) {
          return Response.json({ ok: false, error: "no creds" }, { status: 400 });
        }
        const secret = decrypt(row.api_key_encrypted);
        const appId = row.affiliate_id.trim();

        const url = new URL(request.url);
        const typeName = url.searchParams.get("type");
        if (typeName) {
          const r = await gql(appId, secret, `{__type(name:"${typeName}"){name fields{name type{name kind ofType{name kind ofType{name kind ofType{name}}}}}}}`);
          return new Response(r, { headers: { "Content-Type": "application/json" } });
        }
        // list query fields
        const r = await gql(appId, secret, `{__schema{queryType{fields{name args{name type{name kind ofType{name kind ofType{name}}}} type{name kind ofType{name kind ofType{name}}}}}}}`);
        return new Response(r, { headers: { "Content-Type": "application/json" } });
      },
    },
  },
});
