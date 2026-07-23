
CREATE TABLE public.channel_whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL,
  user_id UUID NOT NULL,
  phone_number TEXT,
  session_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','connected','disconnected')),
  connected_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_whatsapp_sessions TO authenticated;
GRANT ALL ON public.channel_whatsapp_sessions TO service_role;

ALTER TABLE public.channel_whatsapp_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own whatsapp sessions"
ON public.channel_whatsapp_sessions
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_channel_whatsapp_sessions_updated_at
BEFORE UPDATE ON public.channel_whatsapp_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_affiliate_connections_updated_at();

CREATE INDEX idx_channel_whatsapp_sessions_channel ON public.channel_whatsapp_sessions(channel_id);
