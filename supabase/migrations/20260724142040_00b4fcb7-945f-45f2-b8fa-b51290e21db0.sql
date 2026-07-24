
ALTER TABLE public.monitored_groups
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES public.channels(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS monitored_groups_channel_idx
  ON public.monitored_groups (channel_id);

CREATE UNIQUE INDEX IF NOT EXISTS monitored_groups_user_channel_jid_unique
  ON public.monitored_groups (user_id, coalesce(channel_id::text, ''), group_jid);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS source_group_jid text,
  ADD COLUMN IF NOT EXISTS source_group_name text,
  ADD COLUMN IF NOT EXISTS source text;

CREATE INDEX IF NOT EXISTS products_user_channel_rawlink_idx
  ON public.products (user_id, channel_id, raw_link);
