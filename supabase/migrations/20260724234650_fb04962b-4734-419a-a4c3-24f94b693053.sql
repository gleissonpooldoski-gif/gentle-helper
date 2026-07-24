DELETE FROM public.monitored_groups WHERE instance_id IS NULL;
DROP INDEX IF EXISTS public.monitored_groups_user_channel_jid_unique;
DROP INDEX IF EXISTS public.monitored_groups_user_instance_group_uidx;
ALTER TABLE public.monitored_groups ALTER COLUMN instance_id SET NOT NULL;
CREATE UNIQUE INDEX monitored_groups_user_instance_jid_unique ON public.monitored_groups (user_id, instance_id, group_jid);