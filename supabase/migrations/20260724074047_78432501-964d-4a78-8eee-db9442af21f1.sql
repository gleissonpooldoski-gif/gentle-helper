DROP POLICY IF EXISTS "Anon local access sessions" ON public.sessions;
DROP POLICY IF EXISTS "Anon local access products" ON public.products;
DROP POLICY IF EXISTS "Anon local access monitored_groups" ON public.monitored_groups;

REVOKE ALL ON public.sessions FROM anon;
REVOKE ALL ON public.products FROM anon;
REVOKE ALL ON public.monitored_groups FROM anon;

DROP POLICY IF EXISTS "Users manage own whatsapp sessions" ON public.whatsapp_sessions;
CREATE POLICY "Users manage own whatsapp sessions"
ON public.whatsapp_sessions
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own whatsapp_campaign_history" ON public.whatsapp_campaign_history;
CREATE POLICY "own whatsapp_campaign_history"
ON public.whatsapp_campaign_history
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);