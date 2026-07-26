
-- 0) Expandir CHECK de status
ALTER TABLE public.automation_configs
  DROP CONSTRAINT IF EXISTS automation_configs_status_check;
ALTER TABLE public.automation_configs
  ADD CONSTRAINT automation_configs_status_check
  CHECK (status = ANY (ARRAY['idle','running','waiting','paused','error','done','disabled']));

-- 1) Tabela de auditoria
CREATE TABLE public.automation_configs_reconciliation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL,
  previous_status text,
  new_status text NOT NULL,
  reason text NOT NULL,
  migration_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.automation_configs_reconciliation_log TO authenticated;
GRANT ALL ON public.automation_configs_reconciliation_log TO service_role;
ALTER TABLE public.automation_configs_reconciliation_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read reconciliation log for their own configs"
  ON public.automation_configs_reconciliation_log
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.automation_configs c
    WHERE c.id = automation_configs_reconciliation_log.config_id
      AND c.user_id = auth.uid()
  ));
CREATE INDEX idx_reconciliation_log_config_id
  ON public.automation_configs_reconciliation_log (config_id, created_at DESC);

-- 2) Reconciliação
WITH to_disable(cfg_id, reason) AS (
  VALUES
    ('488ab222-b9ba-4c48-a2be-ffb5b18dd96a'::uuid, 'Duplicada com 48f94932 (mesma instância+grupo 120363424316018037@g.us, canal diferente, sem envios registrados)'),
    ('eb0332fc-0cd6-41b9-ae7a-0b826bec9e76'::uuid, 'Config zumbi sem group_id (erro antigo de código já corrigido)'),
    ('2f01ee7e-64c5-4141-bcdb-89b4b83a7fd4'::uuid, 'Duplicada com 787bff00 (mesma instância+grupo 120363408430866100@g.us, sem envios registrados)'),
    ('40e4b7b0-32fd-4336-b2d8-e004fc3518ef'::uuid, 'Triplicada com cb049104 (mesma instância+grupo 120363429067355187@g.us, sem envios registrados) — causa raiz do envio 3x'),
    ('d50c4636-4566-4517-9eb4-94df644b3eb4'::uuid, 'Triplicada com cb049104 (mesma instância+grupo 120363429067355187@g.us, sem envios registrados) — causa raiz do envio 3x'),
    ('74a181c4-7982-4f6f-a3c7-312921cdede3'::uuid, 'Config zumbi sem group_id'),
    ('89d142c7-a663-4ee5-988f-8debbfeac596'::uuid, 'Config órfã sem instance_id'),
    ('834f0829-69b4-415f-b808-e5b0820f7ba3'::uuid, 'Config zumbi sem instance_id e sem group_id')
),
audit_insert AS (
  INSERT INTO public.automation_configs_reconciliation_log
    (config_id, previous_status, new_status, reason, migration_name)
  SELECT t.cfg_id, c.status, 'disabled', t.reason,
         '20260726_reconcile_and_harden_automation_configs'
  FROM to_disable t
  JOIN public.automation_configs c ON c.id = t.cfg_id
  RETURNING config_id
)
UPDATE public.automation_configs c
SET status = 'disabled',
    last_error = CASE
      WHEN c.last_error IS NULL OR c.last_error = ''
        THEN '[reconciliação 26/07/2026] ' || t.reason
      ELSE c.last_error || ' | [reconciliação 26/07/2026] ' || t.reason
    END,
    updated_at = now()
FROM to_disable t
WHERE c.id = t.cfg_id
  AND EXISTS (SELECT 1 FROM audit_insert a WHERE a.config_id = t.cfg_id);

-- 3) UNIQUE parcial em destinos ATIVOS apenas
CREATE UNIQUE INDEX automation_configs_unique_active_destination
  ON public.automation_configs (instance_id, group_id)
  WHERE status IN ('running','waiting','paused')
    AND instance_id IS NOT NULL
    AND group_id IS NOT NULL;
COMMENT ON INDEX public.automation_configs_unique_active_destination IS
  'Impede duas automações ATIVAS (running/waiting/paused) para o mesmo par (instance_id, group_id). Estados error/idle/disabled continuam livres.';

-- 4) Idempotência física por ciclo (índice funcional imutável via cast UTC)
CREATE UNIQUE INDEX automation_group_sends_unique_per_cycle
  ON public.automation_group_sends (
    config_id,
    product_id,
    (date_trunc('minute', (sent_at AT TIME ZONE 'UTC')))
  );
COMMENT ON INDEX public.automation_group_sends_unique_per_cycle IS
  'Idempotência garantida pelo banco: impede que a mesma campanha (config+produto) seja registrada duas vezes no mesmo minuto UTC, mesmo com workers concorrentes.';
