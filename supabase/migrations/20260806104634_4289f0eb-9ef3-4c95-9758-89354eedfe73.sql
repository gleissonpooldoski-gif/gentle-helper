CREATE OR REPLACE FUNCTION public.dispatch_automation_tick()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    url := 'https://sunny-friend-factory.lovable.app/api/public/hooks/automation-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_secret,
      'apikey', 'sb_publishable_Q2XHZhrMoeU0ayxOWS5mfg_ohSKZyli'
    ),
    body := '{}'::jsonb
  ) INTO v_req;

  RETURN v_req;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_tunnel_health()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
  v_req bigint;
BEGIN
  SELECT value INTO v_secret FROM public.cron_secrets WHERE name = 'CRON_SECRET' LIMIT 1;
  IF v_secret IS NULL OR length(v_secret) = 0 THEN
    RAISE NOTICE 'CRON_SECRET ausente em public.cron_secrets — tunnel health nao disparado';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := 'https://sunny-friend-factory.lovable.app/api/public/hooks/tunnel-health',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_secret,
      'apikey', 'sb_publishable_Q2XHZhrMoeU0ayxOWS5mfg_ohSKZyli'
    ),
    body := '{}'::jsonb
  ) INTO v_req;

  RETURN v_req;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_system_reaper()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
  v_req bigint;
BEGIN
  SELECT value INTO v_secret FROM public.cron_secrets WHERE name = 'CRON_SECRET' LIMIT 1;
  IF v_secret IS NULL OR length(v_secret) = 0 THEN
    RAISE NOTICE 'CRON_SECRET ausente em public.cron_secrets — system reaper nao disparado';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := 'https://sunny-friend-factory.lovable.app/api/public/hooks/system-reaper',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_secret,
      'apikey', 'sb_publishable_Q2XHZhrMoeU0ayxOWS5mfg_ohSKZyli'
    ),
    body := '{}'::jsonb
  ) INTO v_req;

  RETURN v_req;
END;
$function$;

REVOKE ALL ON FUNCTION public.cleanup_old_webhook_events() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_retention_policies() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dispatch_automation_tick() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dispatch_tunnel_health() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dispatch_system_reaper() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_webhook_events() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_retention_policies() TO service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_automation_tick() TO service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_tunnel_health() TO service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_system_reaper() TO service_role;

DO $do$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN (
    'automation-tick',
    'instagram-tick',
    'tunnel-health-60s',
    'system-reaper-5m',
    'retention-daily'
  );

  PERFORM cron.schedule(
    'automation-tick',
    '* * * * *',
    'SELECT public.dispatch_automation_tick();'
  );

  PERFORM cron.schedule(
    'instagram-tick',
    '* * * * *',
    $cron$SELECT net.http_post(
      url := 'https://sunny-friend-factory.lovable.app/api/public/hooks/instagram-tick',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT value FROM public.cron_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
        'apikey', 'sb_publishable_Q2XHZhrMoeU0ayxOWS5mfg_ohSKZyli'
      ),
      body := '{}'::jsonb
    );$cron$
  );

  PERFORM cron.schedule(
    'tunnel-health-60s',
    '* * * * *',
    'SELECT public.dispatch_tunnel_health();'
  );

  PERFORM cron.schedule(
    'system-reaper-5m',
    '*/5 * * * *',
    'SELECT public.dispatch_system_reaper();'
  );

  PERFORM cron.schedule(
    'retention-daily',
    '17 3 * * *',
    'SELECT public.run_retention_policies();'
  );
END
$do$;