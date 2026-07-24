
CREATE TABLE public.manual_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  product_link text NOT NULL DEFAULT '',
  keep_link boolean NOT NULL DEFAULT true,
  header_mode text NOT NULL DEFAULT 'default',
  custom_header text NOT NULL DEFAULT '',
  shopee_video_link text NOT NULL DEFAULT '',
  price_original text NOT NULL DEFAULT '',
  price_current text NOT NULL DEFAULT '',
  price_suffix text NOT NULL DEFAULT '',
  price_installment text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  never_expires boolean NOT NULL DEFAULT true,
  scheduled_date date,
  scheduled_time time,
  coupon_type text NOT NULL DEFAULT 'percent',
  coupon_value text NOT NULL DEFAULT '',
  coupon_min_value text NOT NULL DEFAULT '',
  coupon_code text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_posts TO authenticated;
GRANT ALL ON public.manual_posts TO service_role;

ALTER TABLE public.manual_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own manual_posts"
  ON public.manual_posts
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.tg_manual_posts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER manual_posts_updated_at
  BEFORE UPDATE ON public.manual_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_manual_posts_updated_at();

CREATE INDEX manual_posts_scheduled_idx
  ON public.manual_posts (status, never_expires, scheduled_date, scheduled_time);
