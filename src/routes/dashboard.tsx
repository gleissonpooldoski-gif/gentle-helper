import { createFileRoute } from '@tanstack/react-router';
import React, { useEffect, useState } from 'react';
import { ShopeeUploader } from '@/components/ShopeeUploader';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/dashboard')({
  head: () => ({
    meta: [
      { title: 'Painel de Automação de Afiliados' },
      { name: 'description', content: 'Importe produtos da Shopee e gere links de afiliado automaticamente.' },
      { property: 'og:title', content: 'Painel de Automação de Afiliados' },
      { property: 'og:description', content: 'Importe produtos da Shopee e gere links de afiliado automaticamente.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getSessionUser() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
      }
      setLoading(false);
    }
    getSessionUser();
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Carregando painel...</div>;
  }

  if (!userId) {
    return (
      <div className="p-8 text-center text-destructive">
        Usuário não autenticado. Faça login para continuar.
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Painel de Automação de Afiliados</h1>
      <ShopeeUploader userId={userId} />
    </div>
  );
}
