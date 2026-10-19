CREATE TABLE public.numbering_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
  school_code text NOT NULL DEFAULT '0000' CHECK (school_code ~ '^[0-9]{4}$'),
  admission_format text NOT NULL DEFAULT '{SCHOOL}{YY}{SEQ}',
  admission_total_digits integer NOT NULL DEFAULT 10 CHECK (admission_total_digits BETWEEN 6 AND 20),
  admission_year_digits integer NOT NULL DEFAULT 2 CHECK (admission_year_digits BETWEEN 0 AND 4),
  admission_sequence_digits integer NOT NULL DEFAULT 4 CHECK (admission_sequence_digits BETWEEN 1 AND 8),
  admission_sequence_start integer NOT NULL DEFAULT 1 CHECK (admission_sequence_start >= 0),
  employee_format text NOT NULL DEFAULT '{SCHOOL}{YY}{SEQ}',
  employee_total_digits integer NOT NULL DEFAULT 7 CHECK (employee_total_digits BETWEEN 5 AND 20),
  employee_year_digits integer NOT NULL DEFAULT 2 CHECK (employee_year_digits BETWEEN 0 AND 4),
  employee_sequence_digits integer NOT NULL DEFAULT 1 CHECK (employee_sequence_digits BETWEEN 1 AND 8),
  employee_sequence_start integer NOT NULL DEFAULT 1 CHECK (employee_sequence_start >= 0),
  employee_allocation_mode text NOT NULL DEFAULT 'compact' CHECK (employee_allocation_mode IN ('compact','random')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.numbering_settings TO authenticated;
GRANT ALL ON public.numbering_settings TO service_role;
ALTER TABLE public.numbering_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read numbering settings" ON public.numbering_settings FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));
CREATE POLICY "super admin all" ON public.numbering_settings FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE TRIGGER numbering_settings_updated_at BEFORE UPDATE ON public.numbering_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TABLE public.numbering_counters (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('admission','employee')),
  year_key text NOT NULL,
  last_value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, kind, year_key)
);
GRANT SELECT ON public.numbering_counters TO authenticated;
GRANT ALL ON public.numbering_counters TO service_role;
ALTER TABLE public.numbering_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read numbering counters" ON public.numbering_counters FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.next_generated_number(_kind text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg public.numbering_settings%ROWTYPE;
  fmt text; year_digits int; seq_digits int; seq_start bigint; mode text;
  year_part text; seq_value bigint; max_value bigint; candidate text;
  attempts int := 0; taken boolean;
BEGIN
  SELECT ns.* INTO cfg FROM public.numbering_settings ns JOIN public.schools s ON s.id = ns.school_id
  ORDER BY s.active DESC, s.created_at ASC LIMIT 1;
  IF cfg.id IS NULL THEN RETURN NULL; END IF;
  IF _kind = 'admission' THEN
    fmt := cfg.admission_format; year_digits := cfg.admission_year_digits;
    seq_digits := cfg.admission_sequence_digits; seq_start := cfg.admission_sequence_start; mode := 'compact';
  ELSE
    fmt := cfg.employee_format; year_digits := cfg.employee_year_digits;
    seq_digits := cfg.employee_sequence_digits; seq_start := cfg.employee_sequence_start; mode := cfg.employee_allocation_mode;
  END IF;
  year_part := CASE WHEN year_digits = 0 THEN '' ELSE right(to_char(now(), 'YYYY'), year_digits) END;
  max_value := power(10, seq_digits)::bigint - 1;
  IF mode = 'random' THEN
    WHILE attempts < 300 LOOP
      attempts := attempts + 1;
      seq_value := seq_start + floor(random() * GREATEST(max_value - seq_start + 1, 1))::bigint;
      candidate := replace(replace(replace(fmt, '{SCHOOL}', cfg.school_code), '{YY}', year_part), '{SEQ}', lpad(seq_value::text, seq_digits, '0'));
      IF _kind = 'admission' THEN
        SELECT EXISTS (SELECT 1 FROM public.admissions WHERE admission_number = candidate)
            OR EXISTS (SELECT 1 FROM public.profiles WHERE admission_number = candidate) INTO taken;
      ELSE
        SELECT EXISTS (SELECT 1 FROM public.profiles WHERE employee_id = candidate) INTO taken;
      END IF;
      IF NOT taken THEN RETURN candidate; END IF;
    END LOOP;
  END IF;
  INSERT INTO public.numbering_counters (school_id, kind, year_key, last_value)
  VALUES (cfg.school_id, _kind, year_part, seq_start)
  ON CONFLICT (school_id, kind, year_key)
  DO UPDATE SET last_value = GREATEST(public.numbering_counters.last_value + 1, seq_start), updated_at = now()
  RETURNING last_value INTO seq_value;
  RETURN replace(replace(replace(fmt, '{SCHOOL}', cfg.school_code), '{YY}', year_part), '{SEQ}', lpad(seq_value::text, seq_digits, '0'));
END;
$$;
CREATE OR REPLACE FUNCTION public.assign_admission_number() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE generated text;
BEGIN
  IF NEW.role = 'student' AND (NEW.admission_number IS NULL OR NEW.admission_number = '') THEN
    generated := public.next_generated_number('admission');
    NEW.admission_number := COALESCE(generated, 'ADM-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.admission_number_seq')::text, 4, '0'));
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.assign_admission_row_number() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE generated text;
BEGIN
  IF NEW.admission_number IS NULL OR NEW.admission_number = '' THEN
    generated := public.next_generated_number('admission');
    NEW.admission_number := COALESCE(generated, 'ADM-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.admission_number_seq')::text, 4, '0'));
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.assign_employee_id() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE generated text;
BEGIN
  IF NEW.role IN ('staff','school_manager') AND (NEW.employee_id IS NULL OR NEW.employee_id = '') THEN
    generated := public.next_generated_number('employee');
    NEW.employee_id := COALESCE(generated, 'EMP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.employee_id_seq')::text, 4, '0'));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.next_generated_number(text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.assign_admission_number() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.assign_admission_row_number() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.assign_employee_id() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, public;

CREATE TABLE public.finance_income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT current_date,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'received',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.finance_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT current_date,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'paid',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.finance_payroll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  employee_id text,
  employee_name text NOT NULL,
  position text,
  basic_salary numeric(14,2) NOT NULL DEFAULT 0,
  allowances numeric(14,2) NOT NULL DEFAULT 0,
  deductions numeric(14,2) NOT NULL DEFAULT 0,
  net_salary numeric(14,2) GENERATED ALWAYS AS (basic_salary + allowances - deductions) STORED,
  period text,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_income, public.finance_expenses, public.finance_payroll TO authenticated;
GRANT ALL ON public.finance_income, public.finance_expenses, public.finance_payroll TO service_role;
ALTER TABLE public.finance_income ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payroll ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_income_admin" ON public.finance_income FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "finance_expenses_admin" ON public.finance_expenses FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "finance_payroll_admin" ON public.finance_payroll FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE INDEX finance_income_date_idx ON public.finance_income (entry_date DESC);
CREATE INDEX finance_expenses_date_idx ON public.finance_expenses (entry_date DESC);
CREATE TRIGGER finance_income_updated_at BEFORE UPDATE ON public.finance_income FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER finance_expenses_updated_at BEFORE UPDATE ON public.finance_expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER finance_payroll_updated_at BEFORE UPDATE ON public.finance_payroll FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
CREATE POLICY "admins manage assessments" ON public.student_assessments FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "staff record assessments" ON public.student_assessments FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "staff update assessments" ON public.student_assessments FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'staff'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "family reads assessments" ON public.student_assessments FOR SELECT TO authenticated USING (private.owns_admission(admission_id) OR private.has_role(auth.uid(), 'staff'::app_role));
CREATE TRIGGER student_assessments_set_updated_at BEFORE UPDATE ON public.student_assessments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.school_classes (
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
CREATE POLICY "Signed-in users can view classes" ON public.school_classes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admins manage classes" ON public.school_classes FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE TRIGGER school_classes_set_updated_at BEFORE UPDATE ON public.school_classes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX school_classes_school_level_idx ON public.school_classes (school_id, level_code, sort_order);

CREATE OR REPLACE FUNCTION private.staff_teaches_class(_class_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_teachers ct
    WHERE ct.class_name = _class_name
      AND (ct.teacher_id = auth.uid()
        OR lower(ct.teacher_email) = lower(COALESCE((SELECT p.email FROM public.profiles p WHERE p.id = auth.uid()), '')))
  )
$$;
CREATE OR REPLACE FUNCTION private.staff_teaches_admission(_admission_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT EXISTS (SELECT 1 FROM public.admissions a WHERE a.id = _admission_id AND private.staff_teaches_class(a.class_admitted))
$$;
CREATE POLICY "staff read own class admissions" ON public.admissions FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'staff'::app_role) AND private.staff_teaches_class(class_admitted));
CREATE POLICY "staff record attendance" ON public.student_attendance FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role) AND private.staff_teaches_admission(admission_id));
CREATE POLICY "staff update attendance" ON public.student_attendance FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'staff'::app_role) AND private.staff_teaches_admission(admission_id)) WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role) AND private.staff_teaches_admission(admission_id));
CREATE POLICY "family reads attendance" ON public.student_attendance FOR SELECT TO authenticated USING (private.owns_admission(admission_id) OR (private.has_role(auth.uid(), 'staff'::app_role) AND private.staff_teaches_admission(admission_id)));
REVOKE ALL ON public.password_reset_requests FROM anon;
CREATE POLICY "users read own reset requests" ON public.password_reset_requests FOR SELECT TO authenticated USING (lower(email) = lower(COALESCE((SELECT u.email FROM auth.users u WHERE u.id = auth.uid()), '')));
CREATE POLICY "users create own reset request" ON public.password_reset_requests FOR INSERT TO authenticated WITH CHECK (lower(email) = lower(COALESCE((SELECT u.email FROM auth.users u WHERE u.id = auth.uid()), '')));

CREATE TABLE public.teaching_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_name text NOT NULL,
  subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, class_name, subject)
);
GRANT SELECT ON public.teaching_assignments TO authenticated;
GRANT ALL ON public.teaching_assignments TO service_role;
ALTER TABLE public.teaching_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can view teaching assignments" ON public.teaching_assignments FOR SELECT TO authenticated USING (true);
CREATE INDEX teaching_assignments_teacher_idx ON public.teaching_assignments (teacher_id);
CREATE INDEX teaching_assignments_class_idx ON public.teaching_assignments (class_name);
CREATE TRIGGER teaching_assignments_updated_at BEFORE UPDATE ON public.teaching_assignments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.finance_config_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  area_key text NOT NULL,
  section_key text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  effective_from date,
  effective_to date,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text NOT NULL DEFAULT '',
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, section_key, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_config_sections TO authenticated;
GRANT ALL ON public.finance_config_sections TO service_role;
ALTER TABLE public.finance_config_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance config read" ON public.finance_config_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "finance config super admin" ON public.finance_config_sections FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE TRIGGER finance_config_sections_updated_at BEFORE UPDATE ON public.finance_config_sections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX finance_config_sections_lookup ON public.finance_config_sections (school_id, section_key, status);
CREATE TABLE public.finance_reference_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  list_key text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  parent_code text,
  sort_order integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, list_key, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_reference_items TO authenticated;
GRANT ALL ON public.finance_reference_items TO service_role;
ALTER TABLE public.finance_reference_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance reference read" ON public.finance_reference_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "finance reference super admin" ON public.finance_reference_items FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE TRIGGER finance_reference_items_updated_at BEFORE UPDATE ON public.finance_reference_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX finance_reference_items_lookup ON public.finance_reference_items (school_id, list_key, sort_order);
CREATE TABLE public.finance_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  priority integer NOT NULL DEFAULT 1,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_from date,
  effective_to date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, rule_key, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_rules TO authenticated;
GRANT ALL ON public.finance_rules TO service_role;
ALTER TABLE public.finance_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance rules read" ON public.finance_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "finance rules super admin" ON public.finance_rules FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE TRIGGER finance_rules_updated_at BEFORE UPDATE ON public.finance_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX finance_rules_lookup ON public.finance_rules (school_id, rule_key, priority);
CREATE TABLE public.finance_config_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  action text NOT NULL,
  description text NOT NULL DEFAULT '',
  actor_id uuid,
  actor_email text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.finance_config_audit TO authenticated;
GRANT ALL ON public.finance_config_audit TO service_role;
ALTER TABLE public.finance_config_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance audit read" ON public.finance_config_audit FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "finance audit insert" ON public.finance_config_audit FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE INDEX finance_config_audit_lookup ON public.finance_config_audit (school_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_public_branding() RETURNS TABLE(name text, tagline text, logo_url text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(NULLIF(btrim(b.display_name), ''), s.name)::text, COALESCE(b.tagline, '')::text, b.logo_url::text
  FROM public.schools s LEFT JOIN public.school_branding b ON b.school_id = s.id
  ORDER BY s.active DESC, s.created_at ASC LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_public_branding() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_branding() TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.get_public_branding_full()
 RETURNS TABLE(name text, tagline text, logo_url text, primary_color text, accent_color text, established_year text, motto text, language text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(NULLIF(btrim(b.display_name), ''), s.name)::text,
         COALESCE(b.tagline, '')::text, b.logo_url::text,
         COALESCE(b.primary_color, '')::text, COALESCE(b.accent_color, '')::text,
         COALESCE(b.established_year, '')::text, COALESCE(b.motto, '')::text,
         COALESCE(b.language, 'en')::text
  FROM public.schools s LEFT JOIN public.school_branding b ON b.school_id = s.id
  ORDER BY s.active DESC, s.created_at ASC LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.get_public_branding_full() TO anon, authenticated, service_role;