
CREATE OR REPLACE FUNCTION public.try_lock_automation_destination(_instance_id uuid, _group_id text)
RETURNS boolean
LANGUAGE sql
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(
    hashtextextended(
      'automation_dest:' || COALESCE(_instance_id::text, 'null') || ':' || COALESCE(_group_id, 'null'),
      0
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.unlock_automation_destination(_instance_id uuid, _group_id text)
RETURNS boolean
LANGUAGE sql
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(
    hashtextextended(
      'automation_dest:' || COALESCE(_instance_id::text, 'null') || ':' || COALESCE(_group_id, 'null'),
      0
    )
  );
$$;

COMMENT ON FUNCTION public.try_lock_automation_destination(uuid, text) IS
  'Advisory lock por (instance_id, group_id). Retorna true se adquiriu o lock exclusivo, false se outro worker já está processando este destino. Liberado por unlock_automation_destination ou automaticamente no fim da sessão.';
