
CREATE TABLE public.shopee_conversions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  platform TEXT NOT NULL DEFAULT 'shopee',
  order_id TEXT NOT NULL,
  product_id TEXT,
  product_name TEXT NOT NULL,
  product_image TEXT,
  store_name TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  value NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
  qty INTEGER NOT NULL DEFAULT 1,
  buyer_type TEXT NOT NULL DEFAULT 'NEW',
  device TEXT NOT NULL DEFAULT 'APP',
  order_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, order_id, product_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopee_conversions TO authenticated;
GRANT ALL ON public.shopee_conversions TO service_role;

ALTER TABLE public.shopee_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own conversions"
  ON public.shopee_conversions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX shopee_conversions_user_channel_idx
  ON public.shopee_conversions (user_id, channel_id, order_date DESC);

CREATE INDEX shopee_conversions_status_idx
  ON public.shopee_conversions (user_id, status);

CREATE OR REPLACE FUNCTION public.tg_shopee_conversions_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER tg_shopee_conversions_updated_at
  BEFORE UPDATE ON public.shopee_conversions
  FOR EACH ROW EXECUTE FUNCTION public.tg_shopee_conversions_updated_at();

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS reports_last_sync_at TIMESTAMPTZ;
