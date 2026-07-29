
ALTER TABLE public.automation_group_sends
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS message_id text,
  ADD COLUMN IF NOT EXISTS worker_id uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Ajusta default para novas linhas: toda inserção nova entra como CLAIM.
ALTER TABLE public.automation_group_sends
  ALTER COLUMN status SET DEFAULT 'processing';

-- Constraint de valores válidos (idempotente).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'automation_group_sends_status_chk'
  ) THEN
    ALTER TABLE public.automation_group_sends
      ADD CONSTRAINT automation_group_sends_status_chk
      CHECK (status IN ('processing','sent','failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS automation_group_sends_worker_idx
  ON public.automation_group_sends (worker_id);

CREATE INDEX IF NOT EXISTS automation_group_sends_status_idx
  ON public.automation_group_sends (config_id, status);
