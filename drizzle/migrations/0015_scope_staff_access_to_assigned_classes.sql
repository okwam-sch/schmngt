-- Helper: does the calling staff member teach this class?
CREATE OR REPLACE FUNCTION private.staff_teaches_class(_class_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_teachers ct
    WHERE ct.class_name = _class_name
      AND (
        ct.teacher_id = auth.uid()
        OR lower(ct.teacher_email) = lower(COALESCE((SELECT p.email FROM public.profiles p WHERE p.id = auth.uid()), ''))
      )
  )
$$;

CREATE OR REPLACE FUNCTION private.staff_teaches_admission(_admission_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admissions a
    WHERE a.id = _admission_id
      AND private.staff_teaches_class(a.class_admitted)
  )
$$;

-- 1) admissions: scope staff reads to their assigned classes
DROP POLICY IF EXISTS "staff read admissions" ON public.admissions;
CREATE POLICY "staff read own class admissions"
ON public.admissions FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'staff'::app_role)
  AND private.staff_teaches_class(class_admitted)
);

-- 2) student_attendance: scope staff writes/reads to their assigned classes
DROP POLICY IF EXISTS "staff record attendance" ON public.student_attendance;
CREATE POLICY "staff record attendance"
ON public.student_attendance FOR INSERT TO authenticated
WITH CHECK (
  private.has_role(auth.uid(), 'staff'::app_role)
  AND private.staff_teaches_admission(admission_id)
);

DROP POLICY IF EXISTS "staff update attendance" ON public.student_attendance;
CREATE POLICY "staff update attendance"
ON public.student_attendance FOR UPDATE TO authenticated
USING (
  private.has_role(auth.uid(), 'staff'::app_role)
  AND private.staff_teaches_admission(admission_id)
)
WITH CHECK (
  private.has_role(auth.uid(), 'staff'::app_role)
  AND private.staff_teaches_admission(admission_id)
);

DROP POLICY IF EXISTS "family reads attendance" ON public.student_attendance;
CREATE POLICY "family reads attendance"
ON public.student_attendance FOR SELECT TO authenticated
USING (
  private.owns_admission(admission_id)
  OR (
    private.has_role(auth.uid(), 'staff'::app_role)
    AND private.staff_teaches_admission(admission_id)
  )
);

-- 3) password_reset_requests: tie access to the signed-in user's own email,
--    and keep the table unreadable/unwritable for anonymous visitors.
REVOKE ALL ON public.password_reset_requests FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_reset_requests TO authenticated;
GRANT ALL ON public.password_reset_requests TO service_role;

DROP POLICY IF EXISTS "users read own reset requests" ON public.password_reset_requests;
CREATE POLICY "users read own reset requests"
ON public.password_reset_requests FOR SELECT TO authenticated
USING (lower(email) = lower(COALESCE((SELECT u.email FROM auth.users u WHERE u.id = auth.uid()), '')));

DROP POLICY IF EXISTS "users create own reset request" ON public.password_reset_requests;
CREATE POLICY "users create own reset request"
ON public.password_reset_requests FOR INSERT TO authenticated
WITH CHECK (lower(email) = lower(COALESCE((SELECT u.email FROM auth.users u WHERE u.id = auth.uid()), '')));