
-- Fase 1: índices e integridade para isolamento e performance

-- 1. Índices para as queries hot do worker
CREATE INDEX IF NOT EXISTS idx_products_isolation
  ON public.products (user_id, source_group_jid, availability, last_validated_at)
  WHERE source_group_jid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_channel_availability
  ON public.products (channel_id, availability, platform);

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_history_antirepeat
  ON public.whatsapp_campaign_history (config_id, status, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_history_product
  ON public.whatsapp_campaign_history (config_id, product_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_group_sends_lookup
  ON public.automation_group_sends (config_id, product_id);

CREATE INDEX IF NOT EXISTS idx_automation_configs_worker
  ON public.automation_configs (status, next_run_at)
  WHERE status IN ('running', 'waiting');

CREATE INDEX IF NOT EXISTS idx_whatsapp_group_selections_ownership
  ON public.whatsapp_group_selections (user_id, instance_id, channel_id, group_jid);

-- 2. Trigger de integridade: produto capturado de grupo WhatsApp
--    obrigatoriamente precisa ter source_group_jid.
--    Não força NOT NULL na coluna porque imports (Shopee CSV, ML API) não têm grupo de origem.
CREATE OR REPLACE FUNCTION public.enforce_capture_group_jid()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.source = 'whatsapp_capture' AND (NEW.source_group_jid IS NULL OR btrim(NEW.source_group_jid) = '') THEN
    RAISE EXCEPTION 'Produto capturado via WhatsApp exige source_group_jid (isolamento SaaS)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_capture_group_jid ON public.products;
CREATE TRIGGER trg_products_capture_group_jid
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_capture_group_jid();
