ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sales_recent BIGINT,
  ADD COLUMN IF NOT EXISTS sales_historical BIGINT,
  ADD COLUMN IF NOT EXISTS sales_source TEXT,
  ADD COLUMN IF NOT EXISTS sales_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS price_quality TEXT,
  ADD COLUMN IF NOT EXISTS price_quality_reason TEXT;

-- Backfill somente para Shopee, sem sobrescrever
UPDATE public.products
SET sales_recent = sales,
    sales_source = 'shopee_affiliate_api',
    sales_updated_at = COALESCE(updated_at, now())
WHERE platform = 'shopee'
  AND sales IS NOT NULL
  AND sales_recent IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_price_quality ON public.products(price_quality) WHERE platform='shopee';
CREATE INDEX IF NOT EXISTS idx_products_sales_source ON public.products(sales_source) WHERE platform='shopee';