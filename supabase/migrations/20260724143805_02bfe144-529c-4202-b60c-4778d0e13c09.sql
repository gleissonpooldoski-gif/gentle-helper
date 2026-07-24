
-- Recreate site_configs as per-channel
ALTER TABLE public.site_configs ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.site_configs ADD COLUMN IF NOT EXISTS channel_id uuid;

-- Drop old PK on user_id
ALTER TABLE public.site_configs DROP CONSTRAINT IF EXISTS site_configs_pkey;

-- Delete legacy rows without a channel (safe: user recreates per group)
DELETE FROM public.site_configs WHERE channel_id IS NULL;

-- Enforce structure
ALTER TABLE public.site_configs ALTER COLUMN channel_id SET NOT NULL;
ALTER TABLE public.site_configs
  ADD CONSTRAINT site_configs_channel_fk FOREIGN KEY (channel_id)
  REFERENCES public.channels(id) ON DELETE CASCADE;
ALTER TABLE public.site_configs ADD PRIMARY KEY (id);
ALTER TABLE public.site_configs ADD CONSTRAINT site_configs_channel_unique UNIQUE (channel_id);

-- Slug stays globally unique (already UNIQUE on the column)
