
REVOKE EXECUTE ON FUNCTION public.dispatch_automation_tick() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.dispatch_automation_tick() TO service_role;

REVOKE EXECUTE ON FUNCTION public.try_lock_automation_config(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.unlock_automation_config(uuid) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.try_lock_automation_config(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.unlock_automation_config(uuid) TO service_role;
