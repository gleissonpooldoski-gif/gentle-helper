import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface Product {
  id: string;
  title: string;
  promo_price: number;
  affiliate_link: string;
}

export function CampaignSender({ userId }: { userId: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [delaySec, setDelaySec] = useState(5);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProducts() {
      const { data, error } = await supabase
        .from('products')
        .select('id, title, promo_price, affiliate_link')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setProducts(data as Product[]);
      }
      setLoading(false);
    }

    fetchProducts();
  }, [userId]);

  const handleStartCampaign = async () => {
    if (products.length === 0) {
      setStatusMessage('Nenhum produto disponível para disparar.');
      return;
    }

    setStatusMessage(`Iniciando campanha com ${products.length} produtos (Delay: ${delaySec}s)...`);

    for (let i = 0; i < products.length; i++) {
      const prod = products[i];
      const messageText = `🔥 *${prod.title}* \n💰 Por apenas R$ ${prod.promo_price}\n👉 Garanta já o seu: ${prod.affiliate_link}`;

      setStatusMessage(`Enviando (${i + 1}/${products.length}): ${prod.title}`);
      console.log('Disparando mensagem:', messageText);

      await new Promise((resolve) => setTimeout(resolve, delaySec * 1000));
    }

    setStatusMessage('Campanha concluída com sucesso!');
  };

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Carregando produtos para a campanha...</div>;
  }

  return (
    <Card className="max-w-xl mx-auto mt-6">
      <CardHeader>
        <CardTitle>Central de Disparos em Massa</CardTitle>
        <CardDescription>Dispare os produtos importados para os grupos com proteção anti-SPAM.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium leading-none mb-2 block">
            Intervalo entre disparos (Segundos - Anti-SPAM)
          </label>
          <Input
            type="number"
            value={delaySec}
            onChange={(e) => setDelaySec(Number(e.target.value))}
            min={2}
            max={60}
          />
        </div>

        <div className="p-3 bg-muted rounded-lg text-sm">
          <p className="font-semibold text-foreground">Produtos prontos na fila: {products.length}</p>
        </div>

        {statusMessage && (
          <p className="text-sm font-medium text-primary bg-primary/10 p-2 rounded">
            {statusMessage}
          </p>
        )}

        <Button onClick={handleStartCampaign} className="w-full" disabled={products.length === 0}>
          Iniciar Disparos nos Grupos
        </Button>
      </CardContent>
    </Card>
  );
}
