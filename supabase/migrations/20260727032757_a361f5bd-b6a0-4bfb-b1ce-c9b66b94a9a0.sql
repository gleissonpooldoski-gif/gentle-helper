UPDATE public.instagram_admin_schedule SET last_run_at = NULL WHERE id = '21fbe699-7619-448a-abed-63c30d451e56';
SELECT net.http_post(
  url := 'https://sunny-friend-factory.lovable.app/api/public/hooks/instagram-tick',
  headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', (SELECT value FROM public.cron_secrets WHERE name='CRON_SECRET')),
  body := '{}'::jsonb
);