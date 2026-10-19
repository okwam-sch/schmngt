
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_income TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_payroll TO authenticated;
GRANT ALL ON public.finance_income TO service_role;
GRANT ALL ON public.finance_expenses TO service_role;
GRANT ALL ON public.finance_payroll TO service_role;

ALTER TABLE public.finance_income ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payroll ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance_income_admin" ON public.finance_income FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "finance_expenses_admin" ON public.finance_expenses FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "finance_payroll_admin" ON public.finance_payroll FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE INDEX finance_income_date_idx ON public.finance_income (entry_date DESC);
CREATE INDEX finance_expenses_date_idx ON public.finance_expenses (entry_date DESC);

CREATE TRIGGER finance_income_updated_at BEFORE UPDATE ON public.finance_income
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER finance_expenses_updated_at BEFORE UPDATE ON public.finance_expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER finance_payroll_updated_at BEFORE UPDATE ON public.finance_payroll
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
