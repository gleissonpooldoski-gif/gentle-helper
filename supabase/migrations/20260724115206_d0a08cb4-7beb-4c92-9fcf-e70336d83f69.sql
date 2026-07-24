
ALTER TABLE public.post_layouts ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.post_layouts ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES public.channels(id) ON DELETE CASCADE;

ALTER TABLE public.post_layouts DROP CONSTRAINT IF EXISTS post_layouts_pkey;
ALTER TABLE public.post_layouts ADD PRIMARY KEY (id);

-- Unique per user default (channel_id null)
CREATE UNIQUE INDEX IF NOT EXISTS post_layouts_user_default_uidx
  ON public.post_layouts (user_id) WHERE channel_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS post_layouts_user_channel_uidx
  ON public.post_layouts (user_id, channel_id) WHERE channel_id IS NOT NULL;
