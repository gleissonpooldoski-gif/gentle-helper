CREATE UNIQUE INDEX IF NOT EXISTS products_user_channel_platform_item_unique
ON public.products (user_id, channel_id, platform, item_id)
WHERE channel_id IS NOT NULL AND item_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.require_product_channel_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.channel_id IS NULL THEN
    RAISE EXCEPTION 'channel_id is required for products';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS require_product_channel_id_trigger ON public.products;
CREATE TRIGGER require_product_channel_id_trigger
BEFORE INSERT OR UPDATE OF channel_id ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.require_product_channel_id();