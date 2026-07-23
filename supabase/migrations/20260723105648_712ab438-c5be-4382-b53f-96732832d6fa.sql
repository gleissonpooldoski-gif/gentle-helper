-- Deduplicate existing products by (user_id, platform, item_id), keeping the newest
DELETE FROM public.products p
USING public.products q
WHERE p.user_id = q.user_id
  AND p.platform = q.platform
  AND p.item_id IS NOT NULL
  AND q.item_id IS NOT NULL
  AND p.item_id = q.item_id
  AND p.created_at < q.created_at;

-- Unique constraint to support ON CONFLICT (user_id, platform, item_id)
ALTER TABLE public.products
  ADD CONSTRAINT products_user_platform_item_unique
  UNIQUE (user_id, platform, item_id);