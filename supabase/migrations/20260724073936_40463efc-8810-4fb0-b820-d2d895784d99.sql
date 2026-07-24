CREATE TABLE public.channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  external_id text,
  auto_post boolean NOT NULL DEFAULT false,
  interval_min integer NOT NULL DEFAULT 15 CHECK (interval_min BETWEEN 1 AND 1440),
  random_order boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channels_user_external_key UNIQUE (user_id, external_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own channels"
ON public.channels FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own channels"
ON public.channels FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own channels"
ON public.channels FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own channels"
ON public.channels FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_channels_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER channels_set_updated_at
BEFORE UPDATE ON public.channels
FOR EACH ROW EXECUTE FUNCTION public.update_channels_updated_at();

DO $$
DECLARE
  scope record;
  new_channel_id uuid;
BEGIN
  FOR scope IN
    SELECT DISTINCT user_id, channel_id
    FROM public.automation_configs
    WHERE channel_id IS NOT NULL AND btrim(channel_id) <> ''
  LOOP
    INSERT INTO public.channels (user_id, name, external_id)
    VALUES (scope.user_id, 'Canal ' || scope.channel_id, scope.channel_id)
    ON CONFLICT (user_id, external_id) DO UPDATE SET external_id = EXCLUDED.external_id
    RETURNING id INTO new_channel_id;

    UPDATE public.automation_configs
    SET channel_id = new_channel_id::text
    WHERE user_id = scope.user_id AND channel_id = scope.channel_id;

    UPDATE public.channel_whatsapp_connections
    SET channel_id = new_channel_id::text
    WHERE user_id = scope.user_id AND channel_id = scope.channel_id;
  END LOOP;
END;
$$;