UPDATE instagram_admin_schedule SET last_run_at = NULL WHERE id = '21fbe699-7619-448a-abed-63c30d451e56';
SELECT net.http_post(
  url := 'https://project--c8d0a9f8-2712-4d4d-b2f8-6b9530849b41.lovable.app/api/public/hooks/instagram-tick',
  headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', current_setting('app.cron_secret', true))
);