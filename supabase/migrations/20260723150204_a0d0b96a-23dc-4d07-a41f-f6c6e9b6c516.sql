
CREATE TABLE public.channel_whatsapp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected','pending','connected')),
  connected_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_whatsapp_connections TO authenticated;
GRANT ALL ON public.channel_whatsapp_connections TO service_role;

ALTER TABLE public.channel_whatsapp_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own whatsapp connections"
  ON public.channel_whatsapp_connections
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_channel_whatsapp_connections_updated_at
  BEFORE UPDATE ON public.channel_whatsapp_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_ml_integrations_updated_at();
