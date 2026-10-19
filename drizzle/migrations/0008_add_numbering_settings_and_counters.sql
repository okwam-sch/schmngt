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

GRANT SELECT ON public.numbering_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.numbering_settings TO authenticated;
GRANT ALL ON public.numbering_settings TO service_role;
ALTER TABLE public.numbering_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "config read" ON public.numbering_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "super admin all" ON public.numbering_settings FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER numbering_settings_updated_at BEFORE UPDATE ON public.numbering_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
CREATE POLICY "config read" ON public.numbering_counters FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.next_generated_number(_kind text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.numbering_settings%ROWTYPE;
  fmt text;
  year_digits int;
  seq_digits int;
  seq_start bigint;
  mode text;
  year_part text;
  seq_value bigint;
  max_value bigint;
  candidate text;
  attempts int := 0;
  taken boolean;
BEGIN
  SELECT ns.* INTO cfg
  FROM public.numbering_settings ns
  JOIN public.schools s ON s.id = ns.school_id
  ORDER BY s.active DESC, s.created_at ASC
  LIMIT 1;

  IF cfg.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF _kind = 'admission' THEN
    fmt := cfg.admission_format;
    year_digits := cfg.admission_year_digits;
    seq_digits := cfg.admission_sequence_digits;
    seq_start := cfg.admission_sequence_start;
    mode := 'compact';
  ELSE
    fmt := cfg.employee_format;
    year_digits := cfg.employee_year_digits;
    seq_digits := cfg.employee_sequence_digits;
    seq_start := cfg.employee_sequence_start;
    mode := cfg.employee_allocation_mode;
  END IF;

  year_part := CASE WHEN year_digits = 0 THEN ''
                    ELSE right(to_char(now(), 'YYYY'), year_digits) END;
  max_value := power(10, seq_digits)::bigint - 1;

  IF mode = 'random' THEN
    WHILE attempts < 300 LOOP
      attempts := attempts + 1;
      seq_value := seq_start + floor(random() * GREATEST(max_value - seq_start + 1, 1))::bigint;
      candidate := replace(replace(replace(fmt,
        '{SCHOOL}', cfg.school_code),
        '{YY}', year_part),
        '{SEQ}', lpad(seq_value::text, seq_digits, '0'));
      IF _kind = 'admission' THEN
        SELECT EXISTS (SELECT 1 FROM public.admissions WHERE admission_number = candidate)
            OR EXISTS (SELECT 1 FROM public.profiles WHERE admission_number = candidate) INTO taken;
      ELSE
        SELECT EXISTS (SELECT 1 FROM public.profiles WHERE employee_id = candidate) INTO taken;
      END IF;
      IF NOT taken THEN
        RETURN candidate;
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.numbering_counters (school_id, kind, year_key, last_value)
  VALUES (cfg.school_id, _kind, year_part, seq_start)
  ON CONFLICT (school_id, kind, year_key)
  DO UPDATE SET last_value = GREATEST(public.numbering_counters.last_value + 1, seq_start),
                updated_at = now()
  RETURNING last_value INTO seq_value;

  RETURN replace(replace(replace(fmt,
    '{SCHOOL}', cfg.school_code),
    '{YY}', year_part),
    '{SEQ}', lpad(seq_value::text, seq_digits, '0'));
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_admission_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE generated text;
BEGIN
  IF NEW.role = 'student' AND (NEW.admission_number IS NULL OR NEW.admission_number = '') THEN
    generated := public.next_generated_number('admission');
    NEW.admission_number := COALESCE(
      generated,
      'ADM-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.admission_number_seq')::text, 4, '0')
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_admission_row_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE generated text;
BEGIN
  IF NEW.admission_number IS NULL OR NEW.admission_number = '' THEN
    generated := public.next_generated_number('admission');
    NEW.admission_number := COALESCE(
      generated,
      'ADM-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.admission_number_seq')::text, 4, '0')
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_employee_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE generated text;
BEGIN
  IF NEW.role IN ('staff','school_manager') AND (NEW.employee_id IS NULL OR NEW.employee_id = '') THEN
    generated := public.next_generated_number('employee');
    NEW.employee_id := COALESCE(
      generated,
      'EMP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.employee_id_seq')::text, 4, '0')
    );
  END IF;
  RETURN NEW;
END;
$$;