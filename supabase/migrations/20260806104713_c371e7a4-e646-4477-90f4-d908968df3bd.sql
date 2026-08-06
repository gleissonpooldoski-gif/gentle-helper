REVOKE ALL ON TABLE public.cron_secrets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.webhook_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.cron_secrets TO service_role;
GRANT ALL ON TABLE public.webhook_events TO service_role;

DROP POLICY IF EXISTS "backend only cron secrets" ON public.cron_secrets;
CREATE POLICY "backend only cron secrets"
ON public.cron_secrets
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "backend only webhook events" ON public.webhook_events;
CREATE POLICY "backend only webhook events"
ON public.webhook_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);