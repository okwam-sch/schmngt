CREATE TABLE public.student_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id uuid NOT NULL REFERENCES public.admissions(id) ON DELETE CASCADE,
  class_name text NOT NULL DEFAULT '',
  term text NOT NULL DEFAULT '',
  subject text NOT NULL,
  assessment_type text NOT NULL DEFAULT 'Exam',
  score numeric NOT NULL DEFAULT 0,
  out_of numeric NOT NULL DEFAULT 100 CHECK (out_of > 0),
  remark text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX student_assessments_admission_idx ON public.student_assessments(admission_id);
CREATE INDEX student_assessments_created_idx ON public.student_assessments(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_assessments TO authenticated;
GRANT ALL ON public.student_assessments TO service_role;

ALTER TABLE public.student_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage assessments" ON public.student_assessments FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "staff record assessments" ON public.student_assessments FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "staff update assessments" ON public.student_assessments FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'staff'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "family reads assessments" ON public.student_assessments FOR SELECT TO authenticated
  USING (private.owns_admission(admission_id) OR private.has_role(auth.uid(), 'staff'::app_role));

CREATE TRIGGER student_assessments_set_updated_at
  BEFORE UPDATE ON public.student_assessments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();