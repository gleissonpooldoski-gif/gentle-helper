-- ========== 1. Dead-letter queue: falhas de envio ==========
CREATE TABLE public.automation_failures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  config_id UUID,
  product_id UUID,
  group_id TEXT,
  instance_id UUID,
  error_message TEXT NOT NULL,
  error_code TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_failures TO authenticated;
GRANT ALL ON public.automation_failures TO service_role;

ALTER TABLE public.automation_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own failures"
  ON public.automation_failures FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users manage their own failures"
  ON public.automation_failures FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete their own failures"
  ON public.automation_failures FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_automation_failures_user_created
  ON public.automation_failures (user_id, created_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX idx_automation_failures_retry
  ON public.automation_failures (next_retry_at)
  WHERE resolved_at IS NULL AND next_retry_at IS NOT NULL;

CREATE TRIGGER tg_automation_failures_updated_at
  BEFORE UPDATE ON public.automation_failures
  FOR EACH ROW EXECUTE FUNCTION public.tg_automation_configs_updated_at();

-- ========== 2. Webhook idempotency ==========
CREATE TABLE public.webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload_hash TEXT,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

GRANT SELECT ON public.webhook_events TO authenticated;
GRANT ALL ON public.webhook_events TO service_role;

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Sem policies para authenticated escrever — só service_role
-- (via SUPABASE_SERVICE_ROLE_KEY nos webhooks públicos)

CREATE INDEX idx_webhook_events_received
  ON public.webhook_events (received_at DESC);

-- Limpeza automática: mantém só 30 dias
CREATE OR REPLACE FUNCTION public.cleanup_old_webhook_events()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.webhook_events
  WHERE received_at < now() - INTERVAL '30 days';
$$;

-- ========== 3. Circuit breaker por instância ==========
CREATE TABLE public.instance_circuit_breakers (
  instance_id UUID NOT NULL PRIMARY KEY,
  user_id UUID NOT NULL,
  failure_count INTEGER NOT NULL DEFAULT 0,
  opened_at TIMESTAMP WITH TIME ZONE,
  next_attempt_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.instance_circuit_breakers TO authenticated;
GRANT ALL ON public.instance_circuit_breakers TO service_role;

ALTER TABLE public.instance_circuit_breakers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own breakers"
  ON public.instance_circuit_breakers FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX idx_circuit_breakers_user
  ON public.instance_circuit_breakers (user_id);
