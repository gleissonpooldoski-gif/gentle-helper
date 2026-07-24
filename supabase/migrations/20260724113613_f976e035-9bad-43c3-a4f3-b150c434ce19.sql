
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS availability text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS last_validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS validation_error text;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_availability_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_availability_check
  CHECK (availability IN ('active','inactive','out_of_stock','error'));

CREATE INDEX IF NOT EXISTS products_user_platform_availability_idx
  ON public.products (user_id, platform, availability);

CREATE INDEX IF NOT EXISTS products_validation_stale_idx
  ON public.products (last_validated_at NULLS FIRST);
