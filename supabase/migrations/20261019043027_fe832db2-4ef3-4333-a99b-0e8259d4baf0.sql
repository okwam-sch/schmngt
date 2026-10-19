CREATE TYPE public.app_role AS ENUM ('super_admin','school_manager','staff','student','parent');
CREATE TYPE public.access_level AS ENUM ('super_administrator','administrator','standard','basic');
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  role public.app_role NOT NULL DEFAULT 'student',
  access_level public.access_level NOT NULL DEFAULT 'basic',
  status text NOT NULL DEFAULT 'active',
  last_login timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.password_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'pending',
  handled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_reset_requests TO authenticated;
GRANT ALL ON public.password_reset_requests TO service_role;
ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM public, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
CREATE OR REPLACE FUNCTION private.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('super_admin','school_manager')) $$;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM public, anon;
REVOKE ALL ON FUNCTION private.is_admin(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO authenticated, service_role;

CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING ((id = auth.uid()) OR private.is_admin(auth.uid()));
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid()) OR private.is_admin(auth.uid())) WITH CHECK ((id = auth.uid()) OR private.is_admin(auth.uid()));
CREATE POLICY "admins insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "super admins delete profiles" ON public.profiles FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING ((user_id = auth.uid()) OR private.is_admin(auth.uid()));
CREATE POLICY "admins read reset requests" ON public.password_reset_requests FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));
CREATE POLICY "admins update reset requests" ON public.password_reset_requests FOR UPDATE TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS class_name text,
  ADD COLUMN IF NOT EXISTS two_factor_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS force_password_change boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_reset_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON public.profiles (lower(username)) WHERE username IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  description text NOT NULL DEFAULT '',
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  target_user_id uuid,
  target_email text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));
CREATE POLICY "admins insert audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "admins delete audit logs" ON public.audit_logs FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));
CREATE TABLE IF NOT EXISTS public.security_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  allowed_ips text NOT NULL DEFAULT '',
  max_login_attempts integer NOT NULL DEFAULT 5,
  lockout_duration integer NOT NULL DEFAULT 30,
  session_timeout integer NOT NULL DEFAULT 30,
  max_concurrent_sessions integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_settings TO authenticated;
GRANT ALL ON public.security_settings TO service_role;
ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read security settings" ON public.security_settings FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));
CREATE POLICY "admins insert security settings" ON public.security_settings FOR INSERT TO authenticated WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "admins update security settings" ON public.security_settings FOR UPDATE TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER security_settings_updated_at BEFORE UPDATE ON public.security_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.security_settings (singleton) VALUES (true) ON CONFLICT (singleton) DO NOTHING;

CREATE POLICY "super admin full access profiles" ON public.profiles FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "super admin full access user_roles" ON public.user_roles FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "super admin full access audit_logs" ON public.audit_logs FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "super admin full access reset requests" ON public.password_reset_requests FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "super admin full access security_settings" ON public.security_settings FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "admins delete reset requests" ON public.password_reset_requests FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS position text,
  ADD COLUMN IF NOT EXISTS employee_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS salary numeric(12,2),
  ADD COLUMN IF NOT EXISTS start_date date;
CREATE SEQUENCE IF NOT EXISTS public.employee_id_seq START 1;
CREATE OR REPLACE FUNCTION public.assign_employee_id() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.role IN ('staff','school_manager') AND (NEW.employee_id IS NULL OR NEW.employee_id = '') THEN
    NEW.employee_id := 'EMP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.employee_id_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER profiles_employee_id BEFORE INSERT OR UPDATE OF role ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.assign_employee_id();
CREATE TABLE public.staff_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  review_period text NOT NULL,
  rating text NOT NULL,
  rating_score integer NOT NULL DEFAULT 3,
  comments text NOT NULL DEFAULT '',
  reviewer_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_performance TO authenticated;
GRANT ALL ON public.staff_performance TO service_role;
ALTER TABLE public.staff_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff performance readable by self or admins" ON public.staff_performance FOR SELECT TO authenticated USING (staff_id = auth.uid() OR private.is_admin(auth.uid()));
CREATE POLICY "admins manage staff performance" ON public.staff_performance FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER staff_performance_updated_at BEFORE UPDATE ON public.staff_performance FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TABLE public.staff_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  schedule_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  schedule_type text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_schedules TO authenticated;
GRANT ALL ON public.staff_schedules TO service_role;
ALTER TABLE public.staff_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedules readable by self or admins" ON public.staff_schedules FOR SELECT TO authenticated USING (staff_id = auth.uid() OR private.is_admin(auth.uid()));
CREATE POLICY "admins manage schedules" ON public.staff_schedules FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER staff_schedules_updated_at BEFORE UPDATE ON public.staff_schedules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TABLE public.offer_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_name text NOT NULL,
  candidate_email text NOT NULL,
  position text NOT NULL,
  salary numeric(12,2) NOT NULL DEFAULT 0,
  start_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offer_letters TO authenticated;
GRANT ALL ON public.offer_letters TO service_role;
ALTER TABLE public.offer_letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read offer letters" ON public.offer_letters FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));
CREATE POLICY "admins manage offer letters" ON public.offer_letters FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER offer_letters_updated_at BEFORE UPDATE ON public.offer_letters FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE SEQUENCE IF NOT EXISTS public.admission_number_seq;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS admission_number text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_admission_number_key ON public.profiles (admission_number) WHERE admission_number IS NOT NULL;
CREATE OR REPLACE FUNCTION public.assign_admission_number() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.role = 'student' AND (NEW.admission_number IS NULL OR NEW.admission_number = '') THEN
    NEW.admission_number := 'ADM-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.admission_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER profiles_admission_number BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.assign_admission_number();
CREATE TABLE public.admissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_number text UNIQUE,
  student_name text NOT NULL,
  dob date,
  place_of_birth text,
  class_admitted text NOT NULL,
  previous_school text,
  previous_class text,
  last_attendance date,
  reason_for_leaving text,
  disability_status text NOT NULL DEFAULT 'No',
  disability_type text,
  assistance_needed text,
  gender text NOT NULL DEFAULT 'Other',
  parent_name text NOT NULL,
  relationship text,
  parent_phone text,
  alt_contact text,
  hometown text,
  hometown_district text,
  residence text,
  residence_district text,
  parent_email text NOT NULL,
  emergency_name text,
  emergency_phone text,
  emergency_relationship text,
  emergency_residence text,
  emergency_residence_district text,
  address text,
  city text,
  community text,
  digital_address text,
  status text NOT NULL DEFAULT 'admitted',
  student_profile_id uuid,
  parent_profile_id uuid,
  student_login_email text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.assign_admission_row_number() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.admission_number IS NULL OR NEW.admission_number = '' THEN
    NEW.admission_number := 'ADM-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.admission_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER admissions_number BEFORE INSERT ON public.admissions FOR EACH ROW EXECUTE FUNCTION public.assign_admission_row_number();
CREATE TRIGGER admissions_updated_at BEFORE UPDATE ON public.admissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX admissions_parent_email_idx ON public.admissions (lower(parent_email));
CREATE INDEX admissions_parent_profile_idx ON public.admissions (parent_profile_id);
CREATE INDEX admissions_student_profile_idx ON public.admissions (student_profile_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admissions TO authenticated;
GRANT ALL ON public.admissions TO service_role;
ALTER TABLE public.admissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage admissions" ON public.admissions FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "family reads own admissions" ON public.admissions FOR SELECT TO authenticated USING (parent_profile_id = auth.uid() OR student_profile_id = auth.uid());
CREATE OR REPLACE FUNCTION private.owns_admission(_admission_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.admissions a WHERE a.id = _admission_id AND (a.parent_profile_id = auth.uid() OR a.student_profile_id = auth.uid()))
$$;
REVOKE ALL ON FUNCTION private.owns_admission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.owns_admission(uuid) TO authenticated, service_role;
CREATE TABLE public.class_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_name text NOT NULL UNIQUE,
  teacher_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  teacher_name text NOT NULL DEFAULT '',
  teacher_email text NOT NULL DEFAULT '',
  teacher_phone text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER class_teachers_updated_at BEFORE UPDATE ON public.class_teachers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_teachers TO authenticated;
GRANT ALL ON public.class_teachers TO service_role;
ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read class teachers" ON public.class_teachers FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage class teachers" ON public.class_teachers FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TABLE public.student_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id uuid NOT NULL REFERENCES public.admissions(id) ON DELETE CASCADE,
  term text NOT NULL,
  subject text NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  grade text NOT NULL DEFAULT '',
  assessment_type text NOT NULL DEFAULT 'exam',
  remarks text NOT NULL DEFAULT '',
  recorded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_performance TO authenticated;
GRANT ALL ON public.student_performance TO service_role;
ALTER TABLE public.student_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage performance" ON public.student_performance FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "family reads performance" ON public.student_performance FOR SELECT TO authenticated USING (private.owns_admission(admission_id) OR private.has_role(auth.uid(), 'staff'::app_role));
CREATE TABLE public.student_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id uuid NOT NULL REFERENCES public.admissions(id) ON DELETE CASCADE,
  attendance_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'present',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (admission_id, attendance_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_attendance TO authenticated;
GRANT ALL ON public.student_attendance TO service_role;
ALTER TABLE public.student_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage attendance" ON public.student_attendance FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TABLE public.student_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id uuid NOT NULL REFERENCES public.admissions(id) ON DELETE CASCADE,
  term text NOT NULL,
  amount_due numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'unpaid',
  due_date date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER student_fees_updated_at BEFORE UPDATE ON public.student_fees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_fees TO authenticated;
GRANT ALL ON public.student_fees TO service_role;
ALTER TABLE public.student_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage fees" ON public.student_fees FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "family reads fees" ON public.student_fees FOR SELECT TO authenticated USING (private.owns_admission(admission_id));
CREATE TABLE public.student_exeat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id uuid NOT NULL REFERENCES public.admissions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_school',
  reason text NOT NULL DEFAULT '',
  destination text NOT NULL DEFAULT '',
  signed_by_name text NOT NULL DEFAULT '',
  signed_by_id uuid,
  departed_at timestamptz,
  return_at timestamptz,
  returned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER student_exeat_updated_at BEFORE UPDATE ON public.student_exeat FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX student_exeat_admission_idx ON public.student_exeat (admission_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_exeat TO authenticated;
GRANT ALL ON public.student_exeat TO service_role;
ALTER TABLE public.student_exeat ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage exeat" ON public.student_exeat FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "staff manage exeat" ON public.student_exeat FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'staff'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "family reads exeat" ON public.student_exeat FOR SELECT TO authenticated USING (private.owns_admission(admission_id));

CREATE TABLE public.school_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.education_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 1,
  min_age integer,
  max_age integer,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  country text NOT NULL DEFAULT '',
  region text NOT NULL DEFAULT '',
  timezone text NOT NULL DEFAULT 'UTC',
  currency text NOT NULL DEFAULT 'USD',
  locale text NOT NULL DEFAULT 'en-US',
  type_code text NOT NULL DEFAULT 'private',
  level_codes text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  level_code text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  credits numeric,
  elective boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, level_code, code)
);
CREATE TABLE public.tenant_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
  positions text[] NOT NULL DEFAULT '{}',
  departments text[] NOT NULL DEFAULT '{}',
  rating_scale jsonb NOT NULL DEFAULT '[]'::jsonb,
  schedule_types text[] NOT NULL DEFAULT '{}',
  grading_system text NOT NULL DEFAULT 'letter',
  academic_year_start_month integer NOT NULL DEFAULT 9,
  week_starts_on text NOT NULL DEFAULT 'monday',
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_settings_grading_chk CHECK (grading_system IN ('letter','percentage','gpa','points')),
  CONSTRAINT tenant_settings_week_chk CHECK (week_starts_on IN ('monday','sunday')),
  CONSTRAINT tenant_settings_month_chk CHECK (academic_year_start_month BETWEEN 1 AND 12)
);
CREATE TABLE public.school_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  tagline text NOT NULL DEFAULT '',
  logo_url text,
  primary_color text NOT NULL DEFAULT '#2f6f8f',
  accent_color text NOT NULL DEFAULT '#d9a441',
  language text NOT NULL DEFAULT 'en',
  currency text NOT NULL DEFAULT 'USD',
  locale text NOT NULL DEFAULT 'en-US',
  date_format text NOT NULL DEFAULT 'dmy',
  show_powered_by boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_branding_date_chk CHECK (date_format IN ('dmy','mdy','ymd'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_types, public.education_levels, public.schools, public.subjects, public.tenant_settings, public.school_branding TO authenticated;
GRANT ALL ON public.school_types, public.education_levels, public.schools, public.subjects, public.tenant_settings, public.school_branding TO service_role;
ALTER TABLE public.school_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.education_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_branding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "config read" ON public.school_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "config read" ON public.education_levels FOR SELECT TO authenticated USING (true);
CREATE POLICY "config read" ON public.subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY "config read" ON public.tenant_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins read schools" ON public.schools FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));
CREATE POLICY "admins read school branding" ON public.school_branding FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));
CREATE POLICY "super admin all" ON public.school_types FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "super admin all" ON public.education_levels FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "super admin all" ON public.schools FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "super admin all" ON public.subjects FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "super admin all" ON public.tenant_settings FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "super admin all" ON public.school_branding FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE TRIGGER school_types_updated_at BEFORE UPDATE ON public.school_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER education_levels_updated_at BEFORE UPDATE ON public.education_levels FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER schools_updated_at BEFORE UPDATE ON public.schools FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER subjects_updated_at BEFORE UPDATE ON public.subjects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tenant_settings_updated_at BEFORE UPDATE ON public.tenant_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER school_branding_updated_at BEFORE UPDATE ON public.school_branding FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.school_types (code, name, description) VALUES
  ('public','Public / Government','State funded, national curriculum.'),
  ('private','Private / Independent','Privately funded, own fee structure.'),
  ('international','International','IB, Cambridge or multi-curriculum.'),
  ('faith','Faith-based','Mission or religious foundation.'),
  ('special','Special Needs','Inclusive and assisted learning.'),
  ('online','Online / Virtual','Fully remote delivery.'),
  ('vocational','Vocational Institute','Skills and trade certification.');
INSERT INTO public.education_levels (code, name, sort_order, min_age, max_age) VALUES
  ('early-years','Early Years / Nursery',1,2,5),
  ('primary','Primary / Elementary',2,6,11),
  ('junior-secondary','Junior Secondary / Middle',3,12,14),
  ('senior-secondary','Senior Secondary / High',4,15,18),
  ('tvet','Technical & Vocational (TVET)',5,NULL,NULL),
  ('tertiary','Tertiary / University',6,NULL,NULL),
  ('continuing','Continuing & Professional Education',7,NULL,NULL);
ALTER TABLE public.schools
  ADD COLUMN district text NOT NULL DEFAULT '',
  ADD COLUMN town text NOT NULL DEFAULT '',
  ADD COLUMN community text NOT NULL DEFAULT '',
  ADD COLUMN postal_address text NOT NULL DEFAULT '',
  ADD COLUMN gps_address text NOT NULL DEFAULT '';
ALTER TABLE public.school_branding ADD COLUMN IF NOT EXISTS established_year text NOT NULL DEFAULT '';
ALTER TABLE public.school_branding ADD COLUMN IF NOT EXISTS motto text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;