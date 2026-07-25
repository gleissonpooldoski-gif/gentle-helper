
CREATE TABLE IF NOT EXISTS public.instagram_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id text,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  template_id uuid,
  keyword text,
  message text NOT NULL DEFAULT '',
  affiliate_link text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_campaigns TO authenticated;
GRANT ALL ON public.instagram_campaigns TO service_role;

ALTER TABLE public.instagram_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ig_campaigns_authenticated_all" ON public.instagram_campaigns;
CREATE POLICY "ig_campaigns_authenticated_all"
  ON public.instagram_campaigns
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS ig_campaigns_story_idx ON public.instagram_campaigns(story_id);
CREATE INDEX IF NOT EXISTS ig_campaigns_created_idx ON public.instagram_campaigns(created_at DESC);

DROP TRIGGER IF EXISTS tg_ig_campaigns_updated_at ON public.instagram_campaigns;
CREATE TRIGGER tg_ig_campaigns_updated_at
BEFORE UPDATE ON public.instagram_campaigns
FOR EACH ROW EXECUTE FUNCTION public.tg_instagram_admin_updated_at();

ALTER TABLE public.instagram_story_templates
  ADD COLUMN IF NOT EXISTS fabric_json jsonb,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'Template';

ALTER TABLE public.instagram_automations
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'both';

ALTER TABLE public.instagram_logs
  ADD COLUMN IF NOT EXISTS latency_ms integer;
