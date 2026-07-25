
CREATE TABLE public.instagram_admin_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  days int[] NOT NULL DEFAULT '{}',
  hours int[] NOT NULL DEFAULT '{}',
  template_id uuid,
  active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_admin_schedule TO authenticated;
GRANT ALL ON public.instagram_admin_schedule TO service_role;

ALTER TABLE public.instagram_admin_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own admin schedule select" ON public.instagram_admin_schedule
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own admin schedule insert" ON public.instagram_admin_schedule
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own admin schedule update" ON public.instagram_admin_schedule
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own admin schedule delete" ON public.instagram_admin_schedule
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_instagram_admin_schedule_updated_at
BEFORE UPDATE ON public.instagram_admin_schedule
FOR EACH ROW EXECUTE FUNCTION public.tg_instagram_admin_updated_at();
