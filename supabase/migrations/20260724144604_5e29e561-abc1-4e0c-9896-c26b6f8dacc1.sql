
ALTER TABLE public.site_configs
  ADD COLUMN IF NOT EXISTS platforms text[] NOT NULL DEFAULT ARRAY['shopee','mercadolivre','amazon']::text[],
  ADD COLUMN IF NOT EXISTS sort_order text NOT NULL DEFAULT 'recent',
  ADD COLUMN IF NOT EXISTS product_limit integer NOT NULL DEFAULT 60;
