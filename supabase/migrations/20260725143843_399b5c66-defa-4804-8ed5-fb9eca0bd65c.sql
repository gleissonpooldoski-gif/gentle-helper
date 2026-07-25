-- 1) Backfill: legado sem grupo fica marcado como "pendente" ('')
UPDATE public.products SET source_group_jid = '' WHERE source_group_jid IS NULL;

-- 2) NOT NULL + default para novos registros
ALTER TABLE public.products
  ALTER COLUMN source_group_jid SET DEFAULT '',
  ALTER COLUMN source_group_jid SET NOT NULL;

-- 3) Nova unique key incluindo o grupo
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_user_channel_platform_item_unique;

ALTER TABLE public.products
  ADD CONSTRAINT products_user_channel_group_platform_item_unique
  UNIQUE (user_id, channel_id, source_group_jid, platform, item_id);

-- 4) Índice para a fila de envio (busca por canal + grupo + disponibilidade)
CREATE INDEX IF NOT EXISTS idx_products_channel_group_available
  ON public.products (channel_id, source_group_jid, availability, last_validated_at)
  WHERE availability = 'active';