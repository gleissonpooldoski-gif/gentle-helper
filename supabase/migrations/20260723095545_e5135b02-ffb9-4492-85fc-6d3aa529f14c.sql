ALTER TABLE public.affiliate_connections
  ADD COLUMN IF NOT EXISTS affiliate_id text,
  ADD COLUMN IF NOT EXISTS api_key_encrypted text;

INSERT INTO public.affiliate_connections (
  user_id,
  platform,
  affiliate_id,
  api_key_encrypted,
  status,
  last_error,
  created_at,
  updated_at
)
SELECT
  user_id,
  'shopee',
  affiliate_id,
  api_key_ciphertext,
  status,
  last_error,
  created_at,
  updated_at
FROM public.shopee_affiliate_configs
ON CONFLICT (user_id, platform) DO UPDATE SET
  affiliate_id = EXCLUDED.affiliate_id,
  api_key_encrypted = EXCLUDED.api_key_encrypted,
  status = EXCLUDED.status,
  last_error = EXCLUDED.last_error,
  updated_at = EXCLUDED.updated_at;