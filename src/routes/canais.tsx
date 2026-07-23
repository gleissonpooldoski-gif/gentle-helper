import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Trash2, MessageCircle, Radio, Loader2, Power, PowerOff } from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

const LOCAL_USER_ID = "00000000-0000-0000-0000-000000000001";

export const Route = createFileRoute("/canais")({
  head: () => ({
    meta: [
      { title: "Canais e Grupos — DivulgaLinks" },
      {
        name: "description",
        content:
          "Gerencie os grupos e canais do WhatsApp usados para os disparos automáticos de ofertas.",
      },
      { property: "og:title", content: "Canais e Grupos — DivulgaLinks" },
      {
        property: "og:description",
        content: "Cadastre, ative e remova grupos do WhatsApp para automação.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CanaisPage,
});

type MonitoredGroup = {
  id: string;
  group_jid: string;
  group_name: string;
  platform: string;
  is_active: boolean;
  created_at: string;
};

function CanaisPage() {
  const [groups, setGroups] = useState<MonitoredGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [jid, setJid] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("monitored_groups")
      .select("*")
      .eq("user_id", LOCAL_USER_ID)
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    setGroups((data as MonitoredGroup[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !jid.trim()) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("monitored_groups").insert({
      user_id: LOCAL_USER_ID,
      group_name: name.trim(),
      group_jid: jid.trim(),
      platform: "whatsapp",
      is_active: true,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setName("");
    setJid("");
    load();
  }

  async function toggleActive(g: MonitoredGroup) {
    await supabase
      .from("monitored_groups")
      .update({ is_active: !g.is_active })
      .eq("id", g.id);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Remover este grupo?")) return;
    await supabase.from("monitored_groups").delete().eq("id", id);
    load();
  }

  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased lg:flex">
      <AppSidebar activeId="canais" />

      <div className="flex-1 lg:min-w-0">
        <main className="mx-auto w-full max-w-[1200px] px-4 pb-24 pt-10 sm:px-6 lg:px-10">
          <header className="flex items-start justify-between gap-4 border-b border-border/70 pb-6">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                <Radio className="h-3 w-3 text-primary" />
                Canais e Grupos
              </div>
              <h1 className="font-display text-3xl font-bold tracking-tight">
                Grupos do WhatsApp
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Cadastre os grupos usados para os disparos. O <strong>JID</strong> é o
                identificador do grupo (ex.: <code>1203456@g.us</code>).
              </p>
            </div>
          </header>

          <section className="mt-8 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Adicionar novo grupo</h2>
            <form
              onSubmit={handleAdd}
              className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]"
            >
              <Input
                placeholder="Nome do grupo (ex.: Promoções Tech)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                placeholder="JID do grupo (ex.: 1203456@g.us)"
                value={jid}
                onChange={(e) => setJid(e.target.value)}
              />
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-1.5 h-4 w-4" />
                )}
                Adicionar
              </Button>
            </form>
            {error && (
              <p className="mt-3 text-sm text-[color:var(--color-danger)]">{error}</p>
            )}
          </section>

          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Meus grupos{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({groups.length})
                </span>
              </h2>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
              </div>
            ) : groups.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
                <MessageCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Nenhum grupo cadastrado ainda. Adicione o primeiro acima.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {groups.map((g) => (
                  <article
                    key={g.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-sm"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <MessageCircle className="h-4 w-4 text-[color:var(--color-success)]" />
                        <h3 className="truncate font-semibold">{g.group_name}</h3>
                      </div>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                        {g.group_jid}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className={
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase " +
                            (g.is_active
                              ? "bg-[color:var(--color-success)]/12 text-[color:var(--color-success)]"
                              : "bg-muted text-muted-foreground")
                          }
                        >
                          {g.is_active ? "Ativo" : "Pausado"}
                        </span>
                        <span className="text-[10.5px] uppercase text-muted-foreground">
                          {g.platform}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleActive(g)}
                        title={g.is_active ? "Pausar" : "Ativar"}
                      >
                        {g.is_active ? (
                          <PowerOff className="h-3.5 w-3.5" />
                        ) : (
                          <Power className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => remove(g.id)}
                        className="text-[color:var(--color-danger)]"
                        title="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
