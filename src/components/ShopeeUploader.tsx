import React, { useState } from 'react';
import { parseShopeeCSVData } from '@/lib/shopeeAffiliate';
import { supabase } from '@/integrations/supabase/client';

export function ShopeeUploader({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setSuccessCount(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const csvText = event.target?.result as string;
        const parsedProducts = parseShopeeCSVData(csvText, 'whatsapp_campaign');

        if (parsedProducts.length === 0) {
          throw new Error('Nenhum produto válido encontrado no CSV. Verifique o formato.');
        }

        const payload = parsedProducts.map((prod) => ({
          user_id: userId,
          title: prod.title,
          original_price: prod.originalPrice,
          promo_price: prod.promoPrice,
          commission_rate: prod.commissionRate,
          raw_link: prod.rawLink,
          affiliate_link: prod.affiliateLink,
          image_url: prod.imageUrl || null,
          category: prod.category || 'Geral',
        }));

        const { error: dbError } = await supabase.from('products').insert(payload);

        if (dbError) throw dbError;

        setSuccessCount(parsedProducts.length);
      } catch (err: any) {
        console.error('Erro ao processar CSV:', err);
        setError(err.message || 'Erro desconhecido ao salvar produtos.');
      } finally {
        setLoading(false);
      }
    };

    reader.readAsText(file);
  };

  return (
    <div className="p-6 bg-card rounded-xl shadow-sm border border-border max-w-xl mx-auto">
      <h3 className="text-lg font-semibold text-foreground mb-2">Importar Produtos (CSV Shopee)</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Faça o upload do relatório exportado para gerar automaticamente os links de afiliado e salvar na base.
      </p>

      <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary transition-colors">
        <input
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          disabled={loading}
          className="block w-full text-sm text-muted-foreground
            file:mr-4 file:py-2 file:px-4
            file:rounded-full file:border-0
            file:text-sm file:font-semibold
            file:bg-primary/10 file:text-primary
            hover:file:bg-primary/20 cursor-pointer"
        />
      </div>

      {loading && <p className="text-sm text-primary mt-4 text-center">Processando e salvando produtos...</p>}
      {successCount !== null && (
        <p className="text-sm text-green-600 mt-4 text-center font-medium">
          Sucesso! {successCount} produtos importados e salvos com links de afiliado.
        </p>
      )}
      {error && <p className="text-sm text-destructive mt-4 text-center">{error}</p>}
    </div>
  );
}
