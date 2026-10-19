REVOKE ALL ON FUNCTION public.next_generated_number(text) FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.assign_admission_number() SECURITY DEFINER;
ALTER FUNCTION public.assign_admission_row_number() SECURITY DEFINER;
ALTER FUNCTION public.assign_employee_id() SECURITY DEFINER;