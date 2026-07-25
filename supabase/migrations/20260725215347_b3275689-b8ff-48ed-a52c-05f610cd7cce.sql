-- Fase 1: Índices compostos de performance para grandes volumes

-- Padrão quente #1: contagem/listagem de produtos ativos por grupo (automation-tick, GroupAutomationList)
CREATE INDEX IF NOT EXISTS idx_products_user_group_active
  ON public.products (user_id, source_group_jid, availability)
  WHERE availability = 'active' AND affiliate_link IS NOT NULL;

-- Padrão quente #2: listagem por canal + plataforma ordenada por data (dashboard, channel-products)
CREATE INDEX IF NOT EXISTS idx_products_user_channel_platform_created
  ON public.products (user_id, channel_id, platform, availability, created_at DESC);

-- Padrão quente #3: último envio real por config (buildStatus)
CREATE INDEX IF NOT EXISTS idx_wa_history_config_sent
  ON public.whatsapp_campaign_history (config_id, sent_at DESC)
  WHERE status = 'sent';

-- Padrão quente #4: checagem "já enviei" (idempotência do worker)
CREATE INDEX IF NOT EXISTS idx_automation_sends_config_product
  ON public.automation_group_sends (config_id, product_id);

-- Padrão quente #5: histórico por grupo + data (dashboards de canal)
CREATE INDEX IF NOT EXISTS idx_wa_history_user_group_sent
  ON public.whatsapp_campaign_history (user_id, group_id, sent_at DESC)
  WHERE status = 'sent';

-- Padrão quente #6: monitored_groups por usuário + instância (WhatsAppInstancePanel)
CREATE INDEX IF NOT EXISTS idx_monitored_groups_user_instance
  ON public.monitored_groups (user_id, instance_id)
  WHERE is_active = true;

-- Estatísticas atualizadas para o planner escolher os novos índices imediatamente
ANALYZE public.products;
ANALYZE public.whatsapp_campaign_history;
ANALYZE public.automation_group_sends;
ANALYZE public.monitored_groups;
