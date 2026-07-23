
CREATE TABLE public.shopee_affiliate_configs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  affiliate_id text NOT NULL,
  api_key_ciphertext text,
  has_api_key boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopee_affiliate_configs TO authenticated;
GRANT ALL ON public.shopee_affiliate_configs TO service_role;

ALTER TABLE public.shopee_affiliate_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own shopee config"
ON public.shopee_affiliate_configs
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
