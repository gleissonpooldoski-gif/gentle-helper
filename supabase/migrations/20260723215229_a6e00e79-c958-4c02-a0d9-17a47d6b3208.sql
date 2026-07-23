
ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS token_hash text,
  ADD COLUMN IF NOT EXISTS browser_id text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS channel_id uuid;

-- Backfill token_hash from legacy session_key (sha256) for existing rows
UPDATE public.whatsapp_sessions
SET token_hash = encode(digest(session_key, 'sha256'), 'hex')
WHERE token_hash IS NULL AND session_key IS NOT NULL;

-- Allow session_key to be null going forward
ALTER TABLE public.whatsapp_sessions ALTER COLUMN session_key DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_sessions_token_hash_key
  ON public.whatsapp_sessions (token_hash) WHERE token_hash IS NOT NULL;

-- Enable Supabase Realtime for the sessions table
ALTER TABLE public.whatsapp_sessions REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_sessions';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END$$;
