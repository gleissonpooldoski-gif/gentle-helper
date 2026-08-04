CREATE TABLE public.cloudflare_tunnel_status (
  id text NOT NULL PRIMARY KEY DEFAULT 'global',
  current_url text,
  previous_url text,
  status text NOT NULL DEFAULT 'OFFLINE',
  last_check timestamp with time zone,
  last_change timestamp with time zone,
  error_message text,
  last_http_status integer,
  updated_by_source text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT cloudflare_tunnel_status_singleton CHECK (id = 'global')
);

GRANT SELECT ON public.cloudflare_tunnel_status TO authenticated;
GRANT ALL ON public.cloudflare_tunnel_status TO service_role;

ALTER TABLE public.cloudflare_tunnel_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view tunnel status"
ON public.cloudflare_tunnel_status
FOR SELECT
TO authenticated
USING (true);

CREATE TRIGGER cloudflare_tunnel_status_set_updated_at
BEFORE UPDATE ON public.cloudflare_tunnel_status
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.cloudflare_tunnel_status (id, status) VALUES ('global', 'OFFLINE');