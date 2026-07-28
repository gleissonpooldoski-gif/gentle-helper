-- LOTE 8 — Idempotência por destino em automation_group_sends
ALTER TABLE public.automation_group_sends
  ADD COLUMN IF NOT EXISTS group_id text;

-- Backfill: preenche group_id nos registros antigos a partir da config.
UPDATE public.automation_group_sends s
SET group_id = c.group_id
FROM public.automation_configs c
WHERE s.config_id = c.id
  AND s.group_id IS NULL
  AND c.group_id IS NOT NULL;

-- Remove restrições antigas que ignoravam group_id.
ALTER TABLE public.automation_group_sends
  DROP CONSTRAINT IF EXISTS automation_group_sends_config_id_product_id_key;

DROP INDEX IF EXISTS public.automation_group_sends_unique_per_cycle;

-- Nova chave única definitiva: destino (config, produto, grupo).
-- COALESCE cobre registros legados sem group_id.
CREATE UNIQUE INDEX IF NOT EXISTS automation_group_sends_unique_destination
  ON public.automation_group_sends (config_id, product_id, COALESCE(group_id, ''));
