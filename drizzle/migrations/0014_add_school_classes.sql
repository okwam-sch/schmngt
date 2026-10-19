CREATE TABLE IF NOT EXISTS public.school_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  level_code text NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_classes TO authenticated;
GRANT ALL ON public.school_classes TO service_role;

ALTER TABLE public.school_classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users can view classes" ON public.school_classes;
DROP POLICY IF EXISTS "Super admins manage classes" ON public.school_classes;

CREATE POLICY "Signed-in users can view classes"
ON public.school_classes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admins manage classes"
ON public.school_classes FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));

DROP TRIGGER IF EXISTS school_classes_set_updated_at ON public.school_classes;
CREATE TRIGGER school_classes_set_updated_at
BEFORE UPDATE ON public.school_classes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS school_classes_school_level_idx ON public.school_classes (school_id, level_code, sort_order);