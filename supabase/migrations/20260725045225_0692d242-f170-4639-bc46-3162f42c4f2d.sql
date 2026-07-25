
CREATE TABLE IF NOT EXISTS public.instagram_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  instagram_account_id text,
  facebook_page_id text,
  username text,
  name text,
  profile_picture text,
  followers_count integer DEFAULT 0,
  follows_count integer DEFAULT 0,
  media_count integer DEFAULT 0,
  access_token_ciphertext text,
  token_expires_at timestamptz,
  status text NOT NULL DEFAULT 'disconnected',
  last_error text,
  auto_post_enabled boolean NOT NULL DEFAULT false,
  growth_enabled boolean NOT NULL DEFAULT false,
  disable_comment_reply boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_connections TO authenticated;
GRANT ALL ON public.instagram_connections TO service_role;
ALTER TABLE public.instagram_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ig conn" ON public.instagram_connections FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.instagram_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  comment_reply_enabled boolean NOT NULL DEFAULT true,
  comment_reply_text text NOT NULL DEFAULT 'Te mandei o link no privado 😉',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ig_keywords_channel_idx ON public.instagram_keywords(channel_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_keywords TO authenticated;
GRANT ALL ON public.instagram_keywords TO service_role;
ALTER TABLE public.instagram_keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ig kw" ON public.instagram_keywords FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.instagram_story_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  title_color text NOT NULL DEFAULT '#ffffff',
  price_color text NOT NULL DEFAULT '#ffd700',
  caption_template text NOT NULL DEFAULT '🔥 {title}\n💰 {price}\n\nClique no link 👇\n{link}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ig_tpl_channel_idx ON public.instagram_story_templates(channel_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_story_templates TO authenticated;
GRANT ALL ON public.instagram_story_templates TO service_role;
ALTER TABLE public.instagram_story_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ig tpl" ON public.instagram_story_templates FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.instagram_story_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  days integer[] NOT NULL DEFAULT '{}',
  hours integer[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_story_schedule TO authenticated;
GRANT ALL ON public.instagram_story_schedule TO service_role;
ALTER TABLE public.instagram_story_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ig sched" ON public.instagram_story_schedule FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.instagram_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  product_id uuid,
  instagram_media_id text,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  caption text,
  error_message text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ig_posts_channel_idx ON public.instagram_posts(channel_id);
CREATE INDEX IF NOT EXISTS ig_posts_media_idx ON public.instagram_posts(instagram_media_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_posts TO authenticated;
GRANT ALL ON public.instagram_posts TO service_role;
ALTER TABLE public.instagram_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ig posts" ON public.instagram_posts FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.instagram_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connection_id uuid,
  channel_id uuid,
  product_id uuid,
  kind text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ig_events_channel_idx ON public.instagram_events(channel_id);
CREATE INDEX IF NOT EXISTS ig_events_kind_idx ON public.instagram_events(kind);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_events TO authenticated;
GRANT ALL ON public.instagram_events TO service_role;
ALTER TABLE public.instagram_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ig events" ON public.instagram_events FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.tg_ig_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_ig_conn_updated ON public.instagram_connections;
CREATE TRIGGER trg_ig_conn_updated BEFORE UPDATE ON public.instagram_connections
  FOR EACH ROW EXECUTE FUNCTION public.tg_ig_updated_at();
DROP TRIGGER IF EXISTS trg_ig_kw_updated ON public.instagram_keywords;
CREATE TRIGGER trg_ig_kw_updated BEFORE UPDATE ON public.instagram_keywords
  FOR EACH ROW EXECUTE FUNCTION public.tg_ig_updated_at();
DROP TRIGGER IF EXISTS trg_ig_tpl_updated ON public.instagram_story_templates;
CREATE TRIGGER trg_ig_tpl_updated BEFORE UPDATE ON public.instagram_story_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_ig_updated_at();
DROP TRIGGER IF EXISTS trg_ig_sched_updated ON public.instagram_story_schedule;
CREATE TRIGGER trg_ig_sched_updated BEFORE UPDATE ON public.instagram_story_schedule
  FOR EACH ROW EXECUTE FUNCTION public.tg_ig_updated_at();
