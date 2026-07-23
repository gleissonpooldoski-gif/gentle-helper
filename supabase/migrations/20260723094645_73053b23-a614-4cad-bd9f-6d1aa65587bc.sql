
CREATE TABLE public.affiliate_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  affiliate_link text,
  cookie_encrypted text,
  affiliate_tag text,
  status text NOT NULL DEFAULT 'pending',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_connections TO authenticated;
GRANT ALL ON public.affiliate_connections TO service_role;

ALTER TABLE public.affiliate_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own affiliate connections"
ON public.affiliate_connections
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_affiliate_connections_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_affiliate_connections_updated_at
BEFORE UPDATE ON public.affiliate_connections
FOR EACH ROW EXECUTE FUNCTION public.update_affiliate_connections_updated_at();
