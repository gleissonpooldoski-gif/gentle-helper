
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS discount_percentage numeric,
  ADD COLUMN IF NOT EXISTS price_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_discount boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.product_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  old_price numeric,
  new_price numeric NOT NULL,
  old_original_price numeric,
  new_original_price numeric,
  discount_percentage numeric,
  changed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.product_price_history TO authenticated;
GRANT ALL ON public.product_price_history TO service_role;

ALTER TABLE public.product_price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own product price history"
  ON public.product_price_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_price_history.product_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users insert own product price history"
  ON public.product_price_history FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_price_history.product_id
        AND p.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_price_history_product_changed_at
  ON public.product_price_history (product_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_is_discount
  ON public.products (user_id, is_discount) WHERE is_discount = true;
