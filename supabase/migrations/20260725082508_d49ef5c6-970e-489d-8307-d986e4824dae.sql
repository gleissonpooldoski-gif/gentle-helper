
ALTER TABLE public.instagram_automations
  ADD COLUMN IF NOT EXISTS media_id text,
  ADD COLUMN IF NOT EXISTS comment_reply text,
  ADD COLUMN IF NOT EXISTS button_label text,
  ADD COLUMN IF NOT EXISTS button_url text,
  ADD COLUMN IF NOT EXISTS extra_links jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS instagram_automations_media_id_idx
  ON public.instagram_automations(media_id);
