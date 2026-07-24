UPDATE public.channels
SET name = CASE external_id
  WHEN '1' THEN 'SEGREDO DAS PROMOÇÕES'
  WHEN '2' THEN 'MUNDO FITNESS PROMO'
  ELSE name
END,
external_id = CASE external_id
  WHEN '1' THEN '25553'
  WHEN '2' THEN '18902'
  ELSE external_id
END
WHERE external_id IN ('1', '2');

INSERT INTO public.channels (user_id, name, external_id, auto_post, interval_min, random_order)
SELECT DISTINCT user_id, 'OFERTAS DA CONFEITARIA', '77410', false, 15, true
FROM public.channels
ON CONFLICT (user_id, external_id) DO NOTHING;

INSERT INTO public.channels (user_id, name, external_id, auto_post, interval_min, random_order)
SELECT DISTINCT user_id, 'TECH BRASIL DEALS', '43201', true, 20, true
FROM public.channels
ON CONFLICT (user_id, external_id) DO NOTHING;

ALTER TABLE public.automation_configs
ADD COLUMN group_scope text GENERATED ALWAYS AS (COALESCE(group_id, '')) STORED;

DROP INDEX IF EXISTS public.automation_configs_scope_key;
ALTER TABLE public.automation_configs
ADD CONSTRAINT automation_configs_scope_unique UNIQUE (user_id, channel_id, group_scope);

ALTER TABLE public.whatsapp_group_selections
DROP CONSTRAINT IF EXISTS whatsapp_group_selections_instance_id_group_jid_key;
ALTER TABLE public.whatsapp_group_selections
ADD CONSTRAINT whatsapp_group_selections_channel_group_unique UNIQUE (user_id, channel_id, group_jid);