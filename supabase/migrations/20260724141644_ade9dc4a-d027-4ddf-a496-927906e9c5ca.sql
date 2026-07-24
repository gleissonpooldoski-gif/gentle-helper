DROP INDEX IF EXISTS public.products_user_channel_platform_item_unique;
ALTER TABLE public.products
DROP CONSTRAINT IF EXISTS products_user_channel_platform_item_unique;
ALTER TABLE public.products
ADD CONSTRAINT products_user_channel_platform_item_unique
UNIQUE (user_id, channel_id, platform, item_id);