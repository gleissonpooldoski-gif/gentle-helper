
-- 1. instagram_connections
CREATE TABLE public.instagram_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  instagram_account_id text,
  facebook_page_id text,
  username text,
  name text,
  profile_picture text,
  followers_count integer NOT NULL DEFAULT 0,
  follows_count integer NOT NULL DEFAULT 0,
  media_count integer NOT NULL DEFAULT 0,
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
CREATE POLICY "own instagram_connections" ON public.instagram_connections
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. instagram_keywords
CREATE TABLE public.instagram_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  action text NOT NULL DEFAULT 'send_link',
  active boolean NOT NULL DEFAULT true,
  comment_reply_enabled boolean NOT NULL DEFAULT true,
  comment_reply_text text NOT NULL DEFAULT 'Te mandei o link no privado 😉',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_keywords TO authenticated;
GRANT ALL ON public.instagram_keywords TO service_role;
ALTER TABLE public.instagram_keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own instagram_keywords" ON public.instagram_keywords
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_ig_keywords_channel ON public.instagram_keywords(channel_id, active);

-- 3. instagram_story_templates
CREATE TABLE public.instagram_story_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  title_color text NOT NULL DEFAULT '#FFFFFF',
  price_color text NOT NULL DEFAULT '#FFD400',
  caption_template text NOT NULL DEFAULT '🔥 {title}\n💰 {price}\n\nClique no link 👇\n{link}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_story_templates TO authenticated;
GRANT ALL ON public.instagram_story_templates TO service_role;
ALTER TABLE public.instagram_story_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own instagram_story_templates" ON public.instagram_story_templates
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. instagram_posts
CREATE TABLE public.instagram_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  instagram_media_id text,
  kind text NOT NULL DEFAULT 'post',
  status text NOT NULL DEFAULT 'pending',
  caption text,
  error_message text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_posts TO authenticated;
GRANT ALL ON public.instagram_posts TO service_role;
ALTER TABLE public.instagram_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own instagram_posts" ON public.instagram_posts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_ig_posts_channel ON public.instagram_posts(channel_id, published_at DESC);

-- 5. instagram_story_schedule
CREATE TABLE public.instagram_story_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.instagram_story_templates(id) ON DELETE SET NULL,
  days integer[] NOT NULL DEFAULT '{}',
  hours integer[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT false,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_story_schedule TO authenticated;
GRANT ALL ON public.instagram_story_schedule TO service_role;
ALTER TABLE public.instagram_story_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own instagram_story_schedule" ON public.instagram_story_schedule
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6. instagram_events
CREATE TABLE public.instagram_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connection_id uuid REFERENCES public.instagram_connections(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES public.channels(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  kind text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_events TO authenticated;
GRANT ALL ON public.instagram_events TO service_role;
ALTER TABLE public.instagram_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own instagram_events" ON public.instagram_events
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_ig_events_channel_kind ON public.instagram_events(channel_id, kind, created_at DESC);

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.tg_ig_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_ig_conn_upd BEFORE UPDATE ON public.instagram_connections FOR EACH ROW EXECUTE FUNCTION public.tg_ig_updated_at();
CREATE TRIGGER trg_ig_kw_upd BEFORE UPDATE ON public.instagram_keywords FOR EACH ROW EXECUTE FUNCTION public.tg_ig_updated_at();
CREATE TRIGGER trg_ig_tpl_upd BEFORE UPDATE ON public.instagram_story_templates FOR EACH ROW EXECUTE FUNCTION public.tg_ig_updated_at();
CREATE TRIGGER trg_ig_sched_upd BEFORE UPDATE ON public.instagram_story_schedule FOR EACH ROW EXECUTE FUNCTION public.tg_ig_updated_at();
