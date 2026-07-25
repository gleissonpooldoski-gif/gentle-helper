
ALTER TABLE public.post_header_variations
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'normal';

ALTER TABLE public.post_header_variations
  DROP CONSTRAINT IF EXISTS post_header_variations_type_check;
ALTER TABLE public.post_header_variations
  ADD CONSTRAINT post_header_variations_type_check
  CHECK (type IN ('normal','discount'));

UPDATE public.post_header_variations
SET type = 'discount'
WHERE btrim(text) IN (
  '🚨 OFERTA RELÂMPAGO!!',
  '🔥 CORRE QUE ESSA OFERTA PODE ACABAR!',
  '⚡ ACHAMOS UMA PROMOÇÃO IMPERDÍVEL!',
  '🚨 ATENÇÃO: PREÇO BAIXOU!',
  '💥 PROMOÇÃO ENCONTRADA!',
  '⏰ ÚLTIMA CHANCE DE APROVEITAR!',
  '🚀 SUPER OFERTA LIBERADA!',
  '💰 DESCONTO LIBERADO!',
  '🚨 OFERTA EXCLUSIVA!',
  '💥 BAIXOU O PREÇO!',
  '🚨 PREÇO CAIU! APROVEITA ANTES QUE VOLTE!',
  '🔥 OFERTA CONFIRMADA! CORRE!',
  '⚡ PREÇO QUE NÃO DÁ PARA IGNORAR!',
  '💥 ESSA BAIXOU MUITO DE PREÇO!'
);

UPDATE public.post_header_variations
SET type = 'normal'
WHERE btrim(text) IN (
  '🛒 ACHADINHO ENCONTRADO!',
  '🔥 PRODUTO COM PREÇO INCRÍVEL!',
  '⚡ CORRE PARA GARANTIR!',
  '🎯 NOSSA SELEÇÃO DE HOJE!',
  '🔥 IMPERDÍVEL!',
  '🛍️ ACHAMOS UMA OPORTUNIDADE!',
  '🔥 ACHADO DO DIA! OLHA ESSE PREÇO!'
);
