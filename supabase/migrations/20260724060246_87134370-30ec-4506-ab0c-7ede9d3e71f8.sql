
CREATE TABLE public.post_layouts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  header text NOT NULL DEFAULT '🚨 OFERTA RELÂMPAGO!!',
  title_template text NOT NULL DEFAULT '🔥🔥 <b>{title}</b> 🔥🔥',
  upper_title boolean NOT NULL DEFAULT true,
  hide_sales boolean NOT NULL DEFAULT false,
  sales_template text NOT NULL DEFAULT '🛒 <i>{vendas} pedidos</i> 🛒',
  description_template text NOT NULL DEFAULT '<pre>{description}</pre>',
  hide_original boolean NOT NULL DEFAULT false,
  original_price_template text NOT NULL DEFAULT '❌❌ <s>{price_original}</s> ❌❌',
  installment_template text NOT NULL DEFAULT '💳💳 {parcelamento} 💳💳',
  price_template text NOT NULL DEFAULT '💵💵 <b>{price}</b> 💵💵',
  link_template text NOT NULL DEFAULT '🔗COMPRE AQUI {link}',
  footer text NOT NULL DEFAULT '🚨 Promoção sujeita a alteração a qualquer momento!',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_layouts TO authenticated;
GRANT ALL ON public.post_layouts TO service_role;
ALTER TABLE public.post_layouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own post layout" ON public.post_layouts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.whatsapp_send_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  jid text NOT NULL,
  caption text,
  media_url text,
  status text NOT NULL,
  error text,
  message_id text,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_send_history_user_sent_idx ON public.whatsapp_send_history(user_id, sent_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_send_history TO authenticated;
GRANT ALL ON public.whatsapp_send_history TO service_role;
ALTER TABLE public.whatsapp_send_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own wa history" ON public.whatsapp_send_history
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own wa history" ON public.whatsapp_send_history
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
