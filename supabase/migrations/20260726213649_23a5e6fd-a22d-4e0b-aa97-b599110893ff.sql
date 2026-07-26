CREATE OR REPLACE FUNCTION public.format_sales_label(n bigint)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v numeric;
  int_part bigint;
  txt text;
BEGIN
  IF n IS NULL OR n <= 0 THEN RETURN NULL; END IF;
  IF n < 1000 THEN RETURN n::text; END IF;

  IF n < 1000000 THEN
    v := floor((n::numeric / 1000) * 10) / 10;
    IF v = floor(v) THEN
      RETURN v::bigint::text || ' mil';
    ELSE
      RETURN replace(to_char(v, 'FM999999990.0'), '.', ',') || ' mil';
    END IF;
  END IF;

  v := floor((n::numeric / 1000000) * 10) / 10;
  int_part := floor(v)::bigint;
  IF v = floor(v) THEN
    txt := v::bigint::text;
  ELSE
    txt := replace(to_char(v, 'FM999999990.0'), '.', ',');
  END IF;

  IF int_part < 2 THEN RETURN txt || ' milhão';
  ELSE RETURN txt || ' milhões'; END IF;
END;
$$;

UPDATE public.products
SET sales_label = public.format_sales_label(sales::bigint)
WHERE sales IS NOT NULL
  AND sales_label IS DISTINCT FROM public.format_sales_label(sales::bigint);