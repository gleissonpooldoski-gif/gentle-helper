UPDATE public.automation_configs
SET status = 'running',
    last_error = NULL,
    next_run_at = now(),
    updated_at = now()
WHERE status = 'error'
  AND (last_error ILIKE '%Evolution API indisponível%'
       OR last_error ILIKE '%Tunnel%'
       OR last_error ILIKE '%cloudflare%');