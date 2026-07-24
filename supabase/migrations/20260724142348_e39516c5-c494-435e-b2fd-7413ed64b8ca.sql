
CREATE TABLE public.site_configs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  title text NOT NULL DEFAULT 'Meu Site DvLinks',
  logo_url text,
  ga_tag text,
  theme_color text NOT NULL DEFAULT '#3B82F6',
  use_for_amazon_ml boolean NOT NULL DEFAULT false,
  use_for_all boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_configs TO authenticated;
GRANT SELECT ON public.site_configs TO anon;
GRANT ALL ON public.site_configs TO service_role;

ALTER TABLE public.site_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own site config"
  ON public.site_configs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Public can read site config by slug"
  ON public.site_configs FOR SELECT TO anon
  USING (true);

CREATE OR REPLACE FUNCTION public.tg_site_configs_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER site_configs_updated_at
  BEFORE UPDATE ON public.site_configs
  FOR EACH ROW EXECUTE FUNCTION public.tg_site_configs_updated_at();
