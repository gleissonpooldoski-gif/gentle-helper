
CREATE TABLE public.whatsapp_group_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  channel_id uuid NULL,
  group_jid text NOT NULL,
  group_name text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instance_id, group_jid)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_group_selections TO authenticated;
GRANT ALL ON public.whatsapp_group_selections TO service_role;

ALTER TABLE public.whatsapp_group_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own selections" ON public.whatsapp_group_selections
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_wa_group_sel_updated
  BEFORE UPDATE ON public.whatsapp_group_selections
  FOR EACH ROW EXECUTE FUNCTION public.update_whatsapp_instances_updated_at();
