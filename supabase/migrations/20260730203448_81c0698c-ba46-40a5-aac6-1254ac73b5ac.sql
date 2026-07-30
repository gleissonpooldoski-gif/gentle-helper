REVOKE ALL ON FUNCTION public.run_retention_policies() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_retention_policies() TO service_role;