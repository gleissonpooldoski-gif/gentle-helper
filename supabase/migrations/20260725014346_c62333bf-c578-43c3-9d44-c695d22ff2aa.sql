
ALTER TABLE public.post_layouts
  ADD COLUMN IF NOT EXISTS header_mode text NOT NULL DEFAULT 'custom';

ALTER TABLE public.post_layouts
  DROP CONSTRAINT IF EXISTS post_layouts_header_mode_chk;
ALTER TABLE public.post_layouts
  ADD CONSTRAINT post_layouts_header_mode_chk CHECK (header_mode IN ('auto','custom'));

CREATE TABLE IF NOT EXISTS public.post_header_variations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  text text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS post_header_variations_user_idx
  ON public.post_header_variations(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_header_variations TO authenticated;
GRANT ALL ON public.post_header_variations TO service_role;

ALTER TABLE public.post_header_variations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read variations (own + global)" ON public.post_header_variations;
CREATE POLICY "read variations (own + global)"
  ON public.post_header_variations FOR SELECT
  TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "insert own variations" ON public.post_header_variations;
CREATE POLICY "insert own variations"
  ON public.post_header_variations FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "update own variations" ON public.post_header_variations;
CREATE POLICY "update own variations"
  ON public.post_header_variations FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "delete own variations" ON public.post_header_variations;
CREATE POLICY "delete own variations"
  ON public.post_header_variations FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

INSERT INTO public.post_header_variations (user_id, text)
SELECT NULL, t FROM (VALUES
  ('🚨 OFERTA RELÂMPAGO!!'),
  ('🔥 CORRE QUE ESSA OFERTA PODE ACABAR!'),
  ('⚡ ACHAMOS UMA PROMOÇÃO IMPERDÍVEL!'),
  ('🚨 ATENÇÃO: PREÇO BAIXOU!'),
  ('🔥 OPORTUNIDADE DO DIA!'),
  ('💥 PROMOÇÃO ENCONTRADA!'),
  ('⏰ ÚLTIMA CHANCE DE APROVEITAR!'),
  ('🚀 SUPER OFERTA LIBERADA!'),
  ('🔥 PREÇO ESPECIAL POR TEMPO LIMITADO!'),
  ('⚡ NÃO DEIXE PASSAR ESSA OFERTA!'),
  ('🛒 ACHADINHO ENCONTRADO!'),
  ('💰 DESCONTO LIBERADO!'),
  ('🚨 OFERTA EXCLUSIVA!'),
  ('🔥 PRODUTO COM PREÇO INCRÍVEL!'),
  ('⚡ CORRE PARA GARANTIR!'),
  ('🎯 NOSSA SELEÇÃO DE HOJE!'),
  ('💥 BAIXOU O PREÇO!'),
  ('🚀 OFERTA QUENTE CHEGANDO!'),
  ('🔥 IMPERDÍVEL!'),
  ('🛍️ ACHAMOS UMA OPORTUNIDADE!')
) AS s(t)
WHERE NOT EXISTS (
  SELECT 1 FROM public.post_header_variations WHERE user_id IS NULL
);
