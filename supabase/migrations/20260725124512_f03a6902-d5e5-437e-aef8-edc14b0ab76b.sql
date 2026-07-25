
-- Armazenamento privado do segredo do cron (só service_role acessa)
CREATE TABLE IF NOT EXISTS public.cron_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE public.cron_secrets FROM PUBLIC;
REVOKE ALL ON TABLE public.cron_secrets FROM anon, authenticated;
GRANT ALL ON TABLE public.cron_secrets TO service_role;

ALTER TABLE public.cron_secrets ENABLE ROW LEVEL SECURITY;
-- Sem policies: RLS bloqueia anon/authenticated. service_role bypassa RLS.

-- Função dispatcher chamada pelo pg_cron. Lê o segredo e chama o worker
-- com header x-cron-secret. Retorna o request_id do net.http_post.
CREATE OR REPLACE FUNCTION public.dispatch_automation_tick()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
  v_req bigint;
BEGIN
  SELECT value INTO v_secret FROM public.cron_secrets WHERE name = 'CRON_SECRET' LIMIT 1;
  IF v_secret IS NULL OR length(v_secret) = 0 THEN
    RAISE NOTICE 'CRON_SECRET ausente em public.cron_secrets — tick não disparado';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := 'https://project--c8d0a9f8-2712-4d4d-b2f8-6b9530849b41-dev.lovable.app/api/public/hooks/automation-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_secret
    ),
    body := '{}'::jsonb
  ) INTO v_req;

  RETURN v_req;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_automation_tick() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatch_automation_tick() TO service_role;

-- Reagenda o job para usar o dispatcher (sem expor o segredo no comando)
DO $$
BEGIN
  PERFORM cron.unschedule('automation-tick');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'automation-tick',
  '* * * * *',
  $$SELECT public.dispatch_automation_tick();$$
);
