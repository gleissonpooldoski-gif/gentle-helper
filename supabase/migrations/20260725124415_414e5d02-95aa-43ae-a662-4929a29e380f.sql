
-- Advisory lock por config
CREATE OR REPLACE FUNCTION public.try_lock_automation_config(_config_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(
    hashtextextended('automation_config:' || _config_id::text, 0)
  );
$$;

CREATE OR REPLACE FUNCTION public.unlock_automation_config(_config_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(
    hashtextextended('automation_config:' || _config_id::text, 0)
  );
$$;

-- Permissões: só service_role chama (via supabaseAdmin no worker)
REVOKE ALL ON FUNCTION public.try_lock_automation_config(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unlock_automation_config(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_lock_automation_config(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.unlock_automation_config(uuid) TO service_role;

-- Reagenda o cron do automation-tick incluindo o header x-cron-secret.
-- Lê o CRON_SECRET da Vault (definido pelo secret manager do projeto).
DO $$
DECLARE
  v_secret text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'CRON_SECRET'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;

  IF v_secret IS NULL OR length(v_secret) = 0 THEN
    RAISE NOTICE 'CRON_SECRET não encontrado na vault; job atual permanece (será rejeitado até header ser configurado).';
    RETURN;
  END IF;

  PERFORM cron.unschedule('automation-tick');
  PERFORM cron.schedule(
    'automation-tick',
    '* * * * *',
    format($cmd$
      SELECT net.http_post(
        url := 'https://project--c8d0a9f8-2712-4d4d-b2f8-6b9530849b41-dev.lovable.app/api/public/hooks/automation-tick',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', %L
        ),
        body := '{}'::jsonb
      );
    $cmd$, v_secret)
  );
END $$;
