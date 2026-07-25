
-- Instagram Admin (single-account) tables

CREATE TABLE public.instagram_settings (
  id text PRIMARY KEY DEFAULT 'default',
  instagram_business_id text NOT NULL,
  facebook_page_id text NOT NULL,
  access_token_ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instagram_settings_singleton CHECK (id = 'default')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_settings TO authenticated;
GRANT ALL ON public.instagram_settings TO service_role;
ALTER TABLE public.instagram_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read settings" ON public.instagram_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write settings" ON public.instagram_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.instagram_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id text NOT NULL UNIQUE,
  media_id text,
  username text,
  comment text NOT NULL,
  reply text,
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_comments TO authenticated;
GRANT ALL ON public.instagram_comments TO service_role;
ALTER TABLE public.instagram_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage comments" ON public.instagram_comments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.instagram_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL,
  message text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_automations TO authenticated;
GRANT ALL ON public.instagram_automations TO service_role;
ALTER TABLE public.instagram_automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage automations" ON public.instagram_automations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.instagram_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.instagram_logs TO authenticated;
GRANT ALL ON public.instagram_logs TO service_role;
ALTER TABLE public.instagram_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read logs" ON public.instagram_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert logs" ON public.instagram_logs FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.tg_instagram_admin_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_instagram_settings_updated BEFORE UPDATE ON public.instagram_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_instagram_admin_updated_at();
CREATE TRIGGER trg_instagram_automations_updated BEFORE UPDATE ON public.instagram_automations
  FOR EACH ROW EXECUTE FUNCTION public.tg_instagram_admin_updated_at();
