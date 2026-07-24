
-- Automation configs (1 per channel)
CREATE TABLE public.automation_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  hora_inicio time NOT NULL DEFAULT '07:00',
  hora_fim time NOT NULL DEFAULT '22:00',
  intervalo_min integer NOT NULL DEFAULT 15 CHECK (intervalo_min >= 1),
  lojas_ativas text[] NOT NULL DEFAULT ARRAY['shopee','mercadolivre']::text[],
  post_loop boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','running','waiting','error','done')),
  current_index integer NOT NULL DEFAULT 0,
  next_run_at timestamptz,
  last_error text,
  last_sent_at timestamptz,
  last_product_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_configs TO authenticated;
GRANT ALL ON public.automation_configs TO service_role;
ALTER TABLE public.automation_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own automation_configs" ON public.automation_configs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Queue snapshot
CREATE TABLE public.automation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.automation_configs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_index integer NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  store text NOT NULL,
  title text NOT NULL,
  media_url text,
  link text NOT NULL,
  sent_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX automation_queue_config_order_idx ON public.automation_queue (config_id, order_index);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_queue TO authenticated;
GRANT ALL ON public.automation_queue TO service_role;
ALTER TABLE public.automation_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own automation_queue" ON public.automation_queue
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Campaign history
CREATE TABLE public.whatsapp_campaign_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  config_id uuid REFERENCES public.automation_configs(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text,
  store text,
  group_id text,
  group_name text,
  instance_name text,
  media_url text,
  caption text,
  status text NOT NULL CHECK (status IN ('sent','failed')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  error_message text
);
CREATE INDEX whatsapp_campaign_history_user_idx ON public.whatsapp_campaign_history (user_id, sent_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_campaign_history TO authenticated;
GRANT ALL ON public.whatsapp_campaign_history TO service_role;
ALTER TABLE public.whatsapp_campaign_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own whatsapp_campaign_history" ON public.whatsapp_campaign_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_automation_configs_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER automation_configs_set_updated_at
  BEFORE UPDATE ON public.automation_configs
  FOR EACH ROW EXECUTE FUNCTION public.tg_automation_configs_updated_at();
