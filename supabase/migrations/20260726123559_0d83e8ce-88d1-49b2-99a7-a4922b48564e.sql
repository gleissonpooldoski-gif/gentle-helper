-- Fase 1: função canônica
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fase 2: reaponta 23 triggers (nome/tabela/timing/evento preservados)
DROP TRIGGER IF EXISTS update_affiliate_connections_updated_at ON public.affiliate_connections;
CREATE TRIGGER update_affiliate_connections_updated_at BEFORE UPDATE ON public.affiliate_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS automation_configs_set_updated_at ON public.automation_configs;
CREATE TRIGGER automation_configs_set_updated_at BEFORE UPDATE ON public.automation_configs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS tg_automation_failures_updated_at ON public.automation_failures;
CREATE TRIGGER tg_automation_failures_updated_at BEFORE UPDATE ON public.automation_failures FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS update_channel_whatsapp_connections_updated_at ON public.channel_whatsapp_connections;
CREATE TRIGGER update_channel_whatsapp_connections_updated_at BEFORE UPDATE ON public.channel_whatsapp_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS update_channel_whatsapp_sessions_updated_at ON public.channel_whatsapp_session_status;
CREATE TRIGGER update_channel_whatsapp_sessions_updated_at BEFORE UPDATE ON public.channel_whatsapp_session_status FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS channels_set_updated_at ON public.channels;
CREATE TRIGGER channels_set_updated_at BEFORE UPDATE ON public.channels FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_instabot_automations_updated_at ON public.instabot_automations;
CREATE TRIGGER trg_instabot_automations_updated_at BEFORE UPDATE ON public.instabot_automations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_instagram_admin_schedule_updated_at ON public.instagram_admin_schedule;
CREATE TRIGGER trg_instagram_admin_schedule_updated_at BEFORE UPDATE ON public.instagram_admin_schedule FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_instagram_automations_updated ON public.instagram_automations;
CREATE TRIGGER trg_instagram_automations_updated BEFORE UPDATE ON public.instagram_automations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS tg_ig_campaigns_updated_at ON public.instagram_campaigns;
CREATE TRIGGER tg_ig_campaigns_updated_at BEFORE UPDATE ON public.instagram_campaigns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_ig_conn_updated ON public.instagram_connections;
CREATE TRIGGER trg_ig_conn_updated BEFORE UPDATE ON public.instagram_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_ig_kw_updated ON public.instagram_keywords;
CREATE TRIGGER trg_ig_kw_updated BEFORE UPDATE ON public.instagram_keywords FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_instagram_settings_updated ON public.instagram_settings;
CREATE TRIGGER trg_instagram_settings_updated BEFORE UPDATE ON public.instagram_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_ig_sched_updated ON public.instagram_story_schedule;
CREATE TRIGGER trg_ig_sched_updated BEFORE UPDATE ON public.instagram_story_schedule FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_ig_tpl_updated ON public.instagram_story_templates;
CREATE TRIGGER trg_ig_tpl_updated BEFORE UPDATE ON public.instagram_story_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS manual_posts_updated_at ON public.manual_posts;
CREATE TRIGGER manual_posts_updated_at BEFORE UPDATE ON public.manual_posts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_ml_integrations_updated_at ON public.mercadolivre_integrations;
CREATE TRIGGER trg_ml_integrations_updated_at BEFORE UPDATE ON public.mercadolivre_integrations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS tg_shopee_conversions_updated_at ON public.shopee_conversions;
CREATE TRIGGER tg_shopee_conversions_updated_at BEFORE UPDATE ON public.shopee_conversions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS site_configs_updated_at ON public.site_configs;
CREATE TRIGGER site_configs_updated_at BEFORE UPDATE ON public.site_configs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS visual_templates_updated_at ON public.visual_templates;
CREATE TRIGGER visual_templates_updated_at BEFORE UPDATE ON public.visual_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_wa_group_sel_updated ON public.whatsapp_group_selections;
CREATE TRIGGER trg_wa_group_sel_updated BEFORE UPDATE ON public.whatsapp_group_selections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_wa_instances_updated_at ON public.whatsapp_instances;
CREATE TRIGGER trg_wa_instances_updated_at BEFORE UPDATE ON public.whatsapp_instances FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_whatsapp_sessions_updated_at ON public.whatsapp_sessions;
CREATE TRIGGER trg_whatsapp_sessions_updated_at BEFORE UPDATE ON public.whatsapp_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();