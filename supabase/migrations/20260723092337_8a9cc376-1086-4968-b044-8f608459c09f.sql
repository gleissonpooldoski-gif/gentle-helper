-- App runs without authentication (local use). Allow anon full access to app tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitored_groups TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO anon;

DROP POLICY IF EXISTS "Anon local access monitored_groups" ON public.monitored_groups;
CREATE POLICY "Anon local access monitored_groups" ON public.monitored_groups
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon local access products" ON public.products;
CREATE POLICY "Anon local access products" ON public.products
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon local access sessions" ON public.sessions;
CREATE POLICY "Anon local access sessions" ON public.sessions
  FOR ALL TO anon USING (true) WITH CHECK (true);
