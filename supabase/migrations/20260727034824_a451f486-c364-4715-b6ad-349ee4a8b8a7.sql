ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS validation_failure_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.products.validation_failure_count IS
  'Contador de falhas consecutivas de validação. Zera em sucesso. availability só é degradada após N falhas consecutivas (ver validate.server.ts).';