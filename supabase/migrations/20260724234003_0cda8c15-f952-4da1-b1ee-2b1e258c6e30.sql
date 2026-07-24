
ALTER TABLE public.monitored_groups
  ADD COLUMN IF NOT EXISTS instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE;

-- Backfill: liga cada grupo monitorado à instância do canal correspondente do mesmo usuário.
UPDATE public.monitored_groups mg
SET instance_id = wi.id
FROM public.whatsapp_instances wi
WHERE mg.instance_id IS NULL
  AND wi.user_id = mg.user_id
  AND wi.channel_id = mg.channel_id;

CREATE INDEX IF NOT EXISTS monitored_groups_instance_id_idx
  ON public.monitored_groups(instance_id);

CREATE UNIQUE INDEX IF NOT EXISTS monitored_groups_user_instance_group_uidx
  ON public.monitored_groups(user_id, instance_id, group_jid)
  WHERE instance_id IS NOT NULL;
