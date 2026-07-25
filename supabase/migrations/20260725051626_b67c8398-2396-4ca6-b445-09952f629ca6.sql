
CREATE TABLE public.instabot_automations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  ig_media_id text NOT NULL,
  ig_media_url text,
  thumbnail_url text,
  caption text,
  posted_at timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  keywords text[] NOT NULL DEFAULT '{}',
  comment_reply_mode text NOT NULL DEFAULT 'list',
  comment_replies text[] NOT NULL DEFAULT '{}',
  dm_message text NOT NULL DEFAULT '',
  button_label text NOT NULL DEFAULT 'VER PRODUTO',
  button_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, ig_media_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instabot_automations TO authenticated;
GRANT ALL ON public.instabot_automations TO service_role;
ALTER TABLE public.instabot_automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instabot_automations_own" ON public.instabot_automations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.tg_instabot_automations_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_instabot_automations_updated_at
  BEFORE UPDATE ON public.instabot_automations
  FOR EACH ROW EXECUTE FUNCTION public.tg_instabot_automations_updated_at();

CREATE TABLE public.instabot_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES public.instabot_automations(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL,
  ig_user_id text,
  ig_username text,
  comment_id text,
  comment_text text,
  comment_reply text,
  dm_sent boolean NOT NULL DEFAULT false,
  dm_message text,
  button_url text,
  status text NOT NULL DEFAULT 'ok',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX instabot_events_automation_idx ON public.instabot_events(automation_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instabot_events TO authenticated;
GRANT ALL ON public.instabot_events TO service_role;
ALTER TABLE public.instabot_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instabot_events_own" ON public.instabot_events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.instabot_clicks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id uuid NOT NULL REFERENCES public.instabot_automations(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.instabot_events(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX instabot_clicks_automation_idx ON public.instabot_clicks(automation_id, created_at DESC);
GRANT SELECT ON public.instabot_clicks TO authenticated;
GRANT ALL ON public.instabot_clicks TO service_role;
ALTER TABLE public.instabot_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instabot_clicks_read_own" ON public.instabot_clicks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.instabot_automations a
            WHERE a.id = instabot_clicks.automation_id AND a.user_id = auth.uid())
  );
