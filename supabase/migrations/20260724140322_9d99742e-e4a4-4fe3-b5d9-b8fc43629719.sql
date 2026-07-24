
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES public.channels(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_products_user_channel_platform ON public.products(user_id, channel_id, platform);
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_user_platform_item_unique;
CREATE UNIQUE INDEX IF NOT EXISTS products_user_channel_platform_item_unique
  ON public.products(user_id, channel_id, platform, item_id);
