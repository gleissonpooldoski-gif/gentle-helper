
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'shopee',
  ADD COLUMN IF NOT EXISTS item_id text,
  ADD COLUMN IF NOT EXISTS store_name text,
  ADD COLUMN IF NOT EXISTS sales integer,
  ADD COLUMN IF NOT EXISTS commission_value numeric(10,2),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now());

CREATE UNIQUE INDEX IF NOT EXISTS products_user_platform_item_key
  ON public.products (user_id, platform, item_id)
  WHERE item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_user_platform_idx
  ON public.products (user_id, platform);
