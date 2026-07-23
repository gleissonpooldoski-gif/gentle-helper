export interface ShopeeProductRow {
  title: string;
  originalPrice: number;
  promoPrice: number;
  commissionRate: number;
  rawLink: string;
  imageUrl?: string;
  category?: string;
}

export interface GeneratedAffiliateProduct extends ShopeeProductRow {
  affiliateLink: string;
}

/**
 * Normaliza e aplica parâmetros UTM e de afiliado ao link bruto do produto
 */
export function generateAffiliateLink(rawLink: string, trackingId: string = 'whatsapp_bot'): string {
  try {
    const url = new URL(rawLink);

    url.searchParams.set('utm_source', 'saas_automation');
    url.searchParams.set('utm_medium', 'whatsapp');
    url.searchParams.set('utm_campaign', trackingId);

    return url.toString();
  } catch (error) {
    console.error('Erro ao normalizar link de afiliado:', error);
    return rawLink;
  }
}

/**
 * Processa linhas brutas de CSV importadas da Shopee
 */
export function parseShopeeCSVData(csvText: string, trackingId?: string): GeneratedAffiliateProduct[] {
  const lines = csvText.split('\n');
  if (lines.length < 2) return [];

  const results: GeneratedAffiliateProduct[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));

    const title = cols[1] || 'Produto Shopee';
    const originalPrice = parseFloat(cols[2]) || 0;
    const promoPrice = parseFloat(cols[3]) || originalPrice;
    const commissionRate = parseFloat(cols[4]) || 0;
    const rawLink = cols[5] || cols[0] || '';

    if (rawLink) {
      results.push({
        title,
        originalPrice,
        promoPrice,
        commissionRate,
        rawLink,
        affiliateLink: generateAffiliateLink(rawLink, trackingId),
      });
    }
  }

  return results;
}
