
CREATE TABLE public.visual_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT 'Novo template',
  format text NOT NULL DEFAULT 'ig_story',
  preset text NOT NULL DEFAULT 'blank',
  elements jsonb NOT NULL DEFAULT '[]'::jsonb,
  preview_url text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT visual_templates_format_ck CHECK (format IN ('ig_story','ig_post','whatsapp'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visual_templates TO authenticated;
GRANT ALL ON public.visual_templates TO service_role;

ALTER TABLE public.visual_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own visual templates"
  ON public.visual_templates FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX visual_templates_user_format_idx ON public.visual_templates (user_id, format);
CREATE INDEX visual_templates_channel_idx ON public.visual_templates (channel_id);

CREATE OR REPLACE FUNCTION public.tg_visual_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER visual_templates_updated_at
  BEFORE UPDATE ON public.visual_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_visual_templates_updated_at();
