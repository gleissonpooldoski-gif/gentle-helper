
ALTER TABLE public.automation_configs
  ADD COLUMN IF NOT EXISTS group_id text,
  ADD COLUMN IF NOT EXISTS group_name text;

ALTER TABLE public.automation_configs
  DROP CONSTRAINT IF EXISTS automation_configs_user_id_channel_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS automation_configs_scope_key
  ON public.automation_configs (user_id, channel_id, coalesce(group_id, ''));
