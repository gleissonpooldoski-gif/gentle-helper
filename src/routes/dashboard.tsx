import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ShopeeUploader } from '@/components/ShopeeUploader';
import { CampaignSender } from '@/components/CampaignSender';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/dashboard')({
  head: () => ({
    meta: [
      { title: 'Painel de Automação de Afiliados' },
      { name: 'description', content: 'Importe produtos da Shopee e dispare campanhas para grupos com proteção anti-SPAM.' },
      { property: 'og:title', content: 'Painel de Automação de Afiliados' },
      { property: 'og:description', content: 'Importe produtos da Shopee e dispare campanhas para grupos com proteção anti-SPAM.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate({ to: '/auth' });
      } else {
        setUserId(session.user.id);
      }
      setLoading(false);
    }
    checkUser();
  }, [navigate]);

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">Carregando painel...</div>;
  }

  if (!userId) return null;

  return (
    <div className="container mx-auto py-8 px-4 space-y-8">
      <div className="flex justify-between items-center border-b pb-4">
        <h1 className="text-2xl font-bold tracking-tight">Painel de Afiliados - Operação</h1>
        <Button
          variant="outline"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: '/auth' });
          }}
        >
          Sair
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <ShopeeUploader userId={userId} />
        </div>
        <div>
          <CampaignSender userId={userId} />
        </div>
      </div>
    </div>
  );
}
