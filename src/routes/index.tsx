import { createFileRoute } from '@tanstack/react-router';
import { ShopeeUploader } from '@/components/ShopeeUploader';
import { CampaignSender } from '@/components/CampaignSender';

const LOCAL_USER_ID = '00000000-0000-0000-0000-000000000001';

export const Route = createFileRoute('/')({
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
  component: DashboardHome,
});

function DashboardHome() {
  return (
    <div className="container mx-auto py-8 px-4 space-y-8">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold tracking-tight">Painel de Afiliados - Operação</h1>
        <p className="text-sm text-muted-foreground mt-1">Uso livre e local — sem autenticação.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <ShopeeUploader userId={LOCAL_USER_ID} />
        <CampaignSender userId={LOCAL_USER_ID} />
      </div>
    </div>
  );
}
