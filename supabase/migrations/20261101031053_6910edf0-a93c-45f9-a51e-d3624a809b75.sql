DROP POLICY IF EXISTS "family reads performance" ON public.student_performance;
CREATE POLICY "family reads performance" ON public.student_performance FOR SELECT TO authenticated
  USING (private.owns_admission(admission_id) OR (private.has_role(auth.uid(), 'staff'::app_role) AND private.staff_teaches_admission(admission_id)));

DROP POLICY IF EXISTS "staff record assessments" ON public.student_assessments;
CREATE POLICY "staff record assessments" ON public.student_assessments FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role) AND private.staff_teaches_admission(admission_id));

DROP POLICY IF EXISTS "staff update assessments" ON public.student_assessments;
CREATE POLICY "staff update assessments" ON public.student_assessments FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'staff'::app_role) AND private.staff_teaches_admission(admission_id))
  WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role) AND private.staff_teaches_admission(admission_id));

DROP POLICY IF EXISTS "family reads assessments" ON public.student_assessments;
CREATE POLICY "family reads assessments" ON public.student_assessments FOR SELECT TO authenticated
  USING (private.owns_admission(admission_id) OR (private.has_role(auth.uid(), 'staff'::app_role) AND private.staff_teaches_admission(admission_id)));

DROP POLICY IF EXISTS "staff manage exeat" ON public.student_exeat;
CREATE POLICY "staff manage exeat" ON public.student_exeat FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'staff'::app_role) AND private.staff_teaches_admission(admission_id))
  WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role) AND private.staff_teaches_admission(admission_id));