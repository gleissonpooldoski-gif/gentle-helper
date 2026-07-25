
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sales_label text;

ALTER TABLE public.post_layouts
  ALTER COLUMN original_price_template SET DEFAULT '💸 <b>DE:</b> <s>{price_original}</s>',
  ALTER COLUMN price_template SET DEFAULT '✅ <b>POR:</b> <b>{price}</b>',
  ALTER COLUMN sales_template SET DEFAULT '🛒 <i>{vendas} vendidos</i> 🛒';

UPDATE public.post_layouts
  SET original_price_template = '💸 <b>DE:</b> <s>{price_original}</s>'
  WHERE original_price_template = '❌❌ <s>{price_original}</s> ❌❌';

UPDATE public.post_layouts
  SET price_template = '✅ <b>POR:</b> <b>{price}</b>'
  WHERE price_template = '💵💵 <b>{price}</b> 💵💵';

UPDATE public.post_layouts
  SET sales_template = '🛒 <i>{vendas} vendidos</i> 🛒'
  WHERE sales_template = '🛒 <i>{vendas} pedidos</i> 🛒';
