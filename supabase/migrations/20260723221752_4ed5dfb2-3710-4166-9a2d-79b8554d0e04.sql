
ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS qr_code TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'evolution';

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_sessions_user_session_id_key
  ON public.whatsapp_sessions(user_id, session_id)
  WHERE session_id IS NOT NULL;
