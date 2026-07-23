CREATE TABLE public.mercadolivre_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  ml_user_id text,
  access_token_ciphertext text NOT NULL,
  refresh_token_ciphertext text NOT NULL,
  expires_at timestamptz NOT NULL,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mercadolivre_integrations TO authenticated;
GRANT ALL ON public.mercadolivre_integrations TO service_role;

ALTER TABLE public.mercadolivre_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_ml_integration" ON public.mercadolivre_integrations
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_ml_integrations_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_ml_integrations_updated_at
  BEFORE UPDATE ON public.mercadolivre_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_ml_integrations_updated_at();