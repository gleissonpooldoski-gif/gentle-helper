UPDATE public.products
SET
  price_quality = sub.quality,
  price_quality_reason = sub.reason
FROM (
  SELECT
    id,
    CASE
      WHEN promo_price IS NULL OR promo_price <= 0 THEN 'BLOCKED'
      WHEN original_price IS NULL OR original_price <= promo_price THEN 'MEDIUM'
      WHEN ((original_price - promo_price) / original_price) * 100 > 90 THEN 'BLOCKED'
      WHEN title ~* '\y(kit|combo|pacote|unidades?|peç?as?|pecas?|conjunto|atacado)\y'
           AND (original_price / promo_price) >= 5 THEN 'BLOCKED'
      WHEN title ~* '\y(kit|combo|pacote|unidades?|peç?as?|pecas?|conjunto|atacado)\y'
           AND ((original_price - promo_price) / original_price) * 100 > 70 THEN 'BLOCKED'
      WHEN ((original_price - promo_price) / original_price) * 100 > 80 THEN 'LOW'
      WHEN title ~* '\y(kit|combo|pacote|unidades?|peç?as?|pecas?|conjunto|atacado)\y'
           AND ((original_price - promo_price) / original_price) * 100 > 50 THEN 'LOW'
      ELSE 'HIGH'
    END AS quality,
    CASE
      WHEN promo_price IS NULL OR promo_price <= 0 THEN 'missing_promo_price'
      WHEN original_price IS NULL THEN 'missing_original_price'
      WHEN original_price <= promo_price THEN 'original_le_promo'
      WHEN ((original_price - promo_price) / original_price) * 100 > 90 THEN 'extreme_discount'
      WHEN title ~* '\y(kit|combo|pacote|unidades?|peç?as?|pecas?|conjunto|atacado)\y'
           AND ((original_price / promo_price) >= 5
                OR ((original_price - promo_price) / original_price) * 100 > 70)
        THEN 'possible_variant_price_mismatch'
      WHEN ((original_price - promo_price) / original_price) * 100 > 80 THEN 'high_discount'
      WHEN title ~* '\y(kit|combo|pacote|unidades?|peç?as?|pecas?|conjunto|atacado)\y'
           AND ((original_price - promo_price) / original_price) * 100 > 50
        THEN 'variant_term_with_high_discount'
      ELSE 'ok'
    END AS reason
  FROM public.products
  WHERE platform = 'shopee'
) sub
WHERE public.products.id = sub.id
  AND public.products.price_quality IS DISTINCT FROM sub.quality;