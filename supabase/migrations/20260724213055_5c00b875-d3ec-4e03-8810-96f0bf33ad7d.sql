
CREATE TABLE IF NOT EXISTS public.evolution_settings (
  id text PRIMARY KEY DEFAULT 'global',
  base_url text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE ON public.evolution_settings TO authenticated;
GRANT ALL ON public.evolution_settings TO service_role;

ALTER TABLE public.evolution_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read evolution settings" ON public.evolution_settings;
CREATE POLICY "authenticated read evolution settings"
  ON public.evolution_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated write evolution settings" ON public.evolution_settings;
CREATE POLICY "authenticated write evolution settings"
  ON public.evolution_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.evolution_settings (id, base_url) VALUES ('global', '')
  ON CONFLICT (id) DO NOTHING;
