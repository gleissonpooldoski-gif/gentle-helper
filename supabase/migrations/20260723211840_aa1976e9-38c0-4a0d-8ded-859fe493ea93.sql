
-- 1) Rename old per-channel session status table to free the name
ALTER TABLE IF EXISTS public.channel_whatsapp_sessions
  RENAME TO channel_whatsapp_session_status;

-- 2) User-level reusable WhatsApp sessions
CREATE TABLE public.whatsapp_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone_number TEXT,
  session_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  connected_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_sessions_status_check CHECK (status IN ('pending','connected','disconnected'))
);
CREATE INDEX whatsapp_sessions_user_idx ON public.whatsapp_sessions(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_sessions TO authenticated;
GRANT ALL ON public.whatsapp_sessions TO service_role;

ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own whatsapp sessions"
  ON public.whatsapp_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_whatsapp_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_whatsapp_sessions_updated_at
BEFORE UPDATE ON public.whatsapp_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_whatsapp_sessions_updated_at();

-- 3) Link table: channel <-> whatsapp_session
CREATE TABLE public.channel_whatsapp_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id TEXT NOT NULL UNIQUE,
  session_id UUID NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX channel_whatsapp_sessions_session_idx ON public.channel_whatsapp_sessions(session_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_whatsapp_sessions TO authenticated;
GRANT ALL ON public.channel_whatsapp_sessions TO service_role;

ALTER TABLE public.channel_whatsapp_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage links for their sessions"
  ON public.channel_whatsapp_sessions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.whatsapp_sessions s
      WHERE s.id = channel_whatsapp_sessions.session_id
        AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.whatsapp_sessions s
      WHERE s.id = channel_whatsapp_sessions.session_id
        AND s.user_id = auth.uid()
    )
  );
