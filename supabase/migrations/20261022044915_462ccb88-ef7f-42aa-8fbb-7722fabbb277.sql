CREATE OR REPLACE FUNCTION private.staff_teaches_class(_class_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teaching_assignments ta
    WHERE lower(ta.class_name) = lower(_class_name)
      AND ta.teacher_id = auth.uid()
  )
$$;