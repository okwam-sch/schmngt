CREATE TABLE public.teaching_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_name text NOT NULL,
  subject text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, class_name, subject)
);

GRANT SELECT ON public.teaching_assignments TO authenticated;
GRANT ALL ON public.teaching_assignments TO service_role;

ALTER TABLE public.teaching_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can view teaching assignments"
ON public.teaching_assignments FOR SELECT TO authenticated USING (true);

CREATE INDEX teaching_assignments_teacher_idx ON public.teaching_assignments (teacher_id);
CREATE INDEX teaching_assignments_class_idx ON public.teaching_assignments (class_name);

CREATE TRIGGER teaching_assignments_updated_at
BEFORE UPDATE ON public.teaching_assignments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();