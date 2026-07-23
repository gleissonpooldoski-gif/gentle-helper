import { createFileRoute } from '@tanstack/react-router';
import { ConfigAfiliadosPage } from './config-afiliados';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Configurações de Afiliados — DivulgaLinks' },
      {
        name: 'description',
        content:
          'Configure suas contas e chaves de API de afiliados para Shopee, Mercado Livre, Amazon, Magalu, AliExpress e Awin.',
      },
      { property: 'og:title', content: 'Configurações de Afiliados — DivulgaLinks' },
      {
        property: 'og:description',
        content:
          'Central única para configurar suas plataformas de afiliados e gerar links comissionados automaticamente.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: ConfigAfiliadosPage,
});
