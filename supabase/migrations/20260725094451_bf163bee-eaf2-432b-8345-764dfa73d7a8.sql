UPDATE public.post_layouts
SET original_price_template = '❌❌ <s>{price_original}</s> ❌❌',
    price_template = '💵💵 <b>{price}</b> 💵💵',
    updated_at = now();