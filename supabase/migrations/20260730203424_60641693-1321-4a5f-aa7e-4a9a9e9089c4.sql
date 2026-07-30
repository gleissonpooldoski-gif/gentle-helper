-- =========================================================
-- FASE 1..5 — Idempotência, Observabilidade, Alertas, Segurança, Retenção
-- Aditiva. Nenhuma tabela/coluna existente é alterada ou removida.
-- =========================================================

-- ---------- FASE 1: idempotência Instagram ----------
CREATE UNIQUE INDEX IF NOT EXISTS instagram_comments_comment_id_uniq
  ON public.instagram_comments (comment_id);

CREATE UNIQUE INDEX IF NOT EXISTS instabot_events_comment_id_uniq
  ON public.instabot_events (comment_id)
  WHERE comment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.instagram_schedule_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'story',
  run_key text NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS instagram_schedule_runs_unique_window
  ON public.instagram_schedule_runs (schedule_id, kind, run_key);

GRANT SELECT ON public.instagram_schedule_runs TO authenticated;
GRANT ALL ON public.instagram_schedule_runs TO service_role;
ALTER TABLE public.instagram_schedule_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedule_runs_read_authenticated"
  ON public.instagram_schedule_runs FOR SELECT TO authenticated USING (true);

CREATE TRIGGER instagram_schedule_runs_set_updated_at
  BEFORE UPDATE ON public.instagram_schedule_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- FASE 2: histórico de métricas ----------
CREATE TABLE IF NOT EXISTS public.system_metrics_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'green',
  evolution_online boolean,
  evolution_latency_ms integer,
  instances_total integer NOT NULL DEFAULT 0,
  instances_down integer NOT NULL DEFAULT 0,
  instances_stalled integer NOT NULL DEFAULT 0,
  automations_running integer NOT NULL DEFAULT 0,
  automations_error integer NOT NULL DEFAULT 0,
  queue_processing integer NOT NULL DEFAULT 0,
  queue_stuck integer NOT NULL DEFAULT 0,
  sent_last_hour integer NOT NULL DEFAULT 0,
  failed_last_hour integer NOT NULL DEFAULT 0,
  dlq_unresolved integer NOT NULL DEFAULT 0,
  dlq_retry_scheduled integer NOT NULL DEFAULT 0,
  reaper_recovered integer NOT NULL DEFAULT 0,
  avg_processing_ms integer,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS system_metrics_history_captured_at_idx
  ON public.system_metrics_history (captured_at DESC);

GRANT SELECT ON public.system_metrics_history TO authenticated;
GRANT ALL ON public.system_metrics_history TO service_role;
ALTER TABLE public.system_metrics_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "metrics_read_authenticated"
  ON public.system_metrics_history FOR SELECT TO authenticated USING (true);

-- ---------- FASE 3: alertas ----------
CREATE TABLE IF NOT EXISTS public.system_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  subject text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'warning',
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  occurrences integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS system_alerts_unique_open
  ON public.system_alerts (kind, subject)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS system_alerts_recent_idx
  ON public.system_alerts (created_at DESC);

GRANT SELECT ON public.system_alerts TO authenticated;
GRANT ALL ON public.system_alerts TO service_role;
ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts_read_authenticated"
  ON public.system_alerts FOR SELECT TO authenticated USING (true);

CREATE TRIGGER system_alerts_set_updated_at
  BEFORE UPDATE ON public.system_alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- FASE 4: audit log ----------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity text,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_user_created_idx
  ON public.audit_log (user_id, created_at DESC);

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_read_own"
  ON public.audit_log FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ---------- FASE 5: retenção ----------
CREATE OR REPLACE FUNCTION public.run_retention_policies()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_campaign integer := 0;
  v_logs integer := 0;
  v_webhooks integer := 0;
  v_metrics integer := 0;
  v_sends integer := 0;
BEGIN
  DELETE FROM public.whatsapp_campaign_history WHERE sent_at < now() - INTERVAL '180 days';
  GET DIAGNOSTICS v_campaign = ROW_COUNT;

  DELETE FROM public.instagram_logs WHERE created_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS v_logs = ROW_COUNT;

  DELETE FROM public.webhook_events WHERE received_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS v_webhooks = ROW_COUNT;

  DELETE FROM public.system_metrics_history WHERE captured_at < now() - INTERVAL '90 days';
  GET DIAGNOSTICS v_metrics = ROW_COUNT;

  -- histórico antigo de execuções de agendamento (não afeta idempotência corrente)
  DELETE FROM public.instagram_schedule_runs WHERE created_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS v_sends = ROW_COUNT;

  RETURN jsonb_build_object(
    'campaign_history', v_campaign,
    'instagram_logs', v_logs,
    'webhook_events', v_webhooks,
    'metrics_history', v_metrics,
    'schedule_runs', v_sends
  );
END;
$$;