CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_name text NOT NULL,
  phone text NOT NULL,
  message text,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  status text NOT NULL DEFAULT 'pending',
  message_id text,
  error text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own whatsapp_messages" ON public.whatsapp_messages
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS whatsapp_messages_user_created_idx ON public.whatsapp_messages (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_unique_msg
  ON public.whatsapp_messages (instance_name, message_id, direction)
  WHERE message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.evolution_user_settings (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  base_url text,
  api_key_ciphertext text,
  instance_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.evolution_user_settings TO authenticated;
GRANT ALL ON public.evolution_user_settings TO service_role;
ALTER TABLE public.evolution_user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own evolution_user_settings" ON public.evolution_user_settings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER evolution_user_settings_set_updated_at
  BEFORE UPDATE ON public.evolution_user_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();