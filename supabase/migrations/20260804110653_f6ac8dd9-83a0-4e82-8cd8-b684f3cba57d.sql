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
    url := 'https://project--c8d0a9f8-2712-4d4d-b2f8-6b9530849b41.lovable.app/api/public/hooks/tunnel-health',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_secret
    ),
    body := '{}'::jsonb
  ) INTO v_req;

  RETURN v_req;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.dispatch_tunnel_health() FROM PUBLIC, anon, authenticated;