
CREATE TABLE public.automation_group_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  config_id uuid NOT NULL REFERENCES public.automation_configs(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (config_id, product_id)
);

CREATE INDEX automation_group_sends_config_idx ON public.automation_group_sends(config_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_group_sends TO authenticated;
GRANT ALL ON public.automation_group_sends TO service_role;

ALTER TABLE public.automation_group_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own automation_group_sends" ON public.automation_group_sends
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
