DELETE FROM public.whatsapp_group_selections WHERE instance_id = '83d2efec-d513-4a67-a344-01606e116864';
DELETE FROM public.monitored_groups WHERE instance_id = '83d2efec-d513-4a67-a344-01606e116864';
UPDATE public.automation_configs SET instance_id = NULL, status = 'disabled' WHERE instance_id = '83d2efec-d513-4a67-a344-01606e116864';
DELETE FROM public.instance_circuit_breakers WHERE instance_id = '83d2efec-d513-4a67-a344-01606e116864';
UPDATE public.whatsapp_send_history SET instance_id = NULL WHERE instance_id = '83d2efec-d513-4a67-a344-01606e116864';
DELETE FROM public.whatsapp_instances WHERE instance_name = 'DIVULGA LINKS';