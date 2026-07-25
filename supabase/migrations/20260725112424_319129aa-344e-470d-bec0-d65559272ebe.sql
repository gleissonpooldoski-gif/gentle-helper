-- Envolve todo o texto do cabeçalho em <b>...</b>. O renderer converte
-- <b> em *...* no WhatsApp e mantém negrito em HTML/Instagram.
-- Idempotente: só envolve quem ainda não contém <b>.
UPDATE public.post_header_variations
SET text = '<b>' || text || '</b>'
WHERE text IS NOT NULL
  AND btrim(text) <> ''
  AND text NOT ILIKE '%<b>%';

-- Atualiza layouts que ainda usam o default antigo, para pegar o novo em negrito.
UPDATE public.post_layouts
SET header = '🚨 <b>OFERTA RELÂMPAGO!!</b>'
WHERE header = '🚨 OFERTA RELÂMPAGO!!';