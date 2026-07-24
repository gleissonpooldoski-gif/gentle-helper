
CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id UUID,
  provider TEXT NOT NULL DEFAULT 'evolution',
  instance_name TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'creating',
  qr_code TEXT,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, instance_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_instances TO authenticated;
GRANT ALL ON public.whatsapp_instances TO service_role;

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_instances_select_own" ON public.whatsapp_instances
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "wa_instances_insert_own" ON public.whatsapp_instances
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wa_instances_update_own" ON public.whatsapp_instances
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wa_instances_delete_own" ON public.whatsapp_instances
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_whatsapp_instances_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_wa_instances_updated_at ON public.whatsapp_instances;
CREATE TRIGGER trg_wa_instances_updated_at
  BEFORE UPDATE ON public.whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_whatsapp_instances_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_instances;
