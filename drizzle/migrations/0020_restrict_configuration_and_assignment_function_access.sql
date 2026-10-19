
DROP POLICY IF EXISTS "config read" ON public.numbering_counters;
CREATE POLICY "admins read numbering counters"
ON public.numbering_counters FOR SELECT TO authenticated
USING (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "config read" ON public.numbering_settings;
CREATE POLICY "admins read numbering settings"
ON public.numbering_settings FOR SELECT TO authenticated
USING (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "config read" ON public.schools;
CREATE POLICY "admins read schools"
ON public.schools FOR SELECT TO authenticated
USING (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "config read" ON public.school_branding;
CREATE POLICY "admins read school branding"
ON public.school_branding FOR SELECT TO authenticated
USING (private.is_admin(auth.uid()));

REVOKE EXECUTE ON FUNCTION public.next_generated_number(text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.assign_admission_number() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.assign_admission_row_number() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.assign_employee_id() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, public;