
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
CREATE POLICY "finance config super admin" ON public.finance_config_sections FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE TRIGGER finance_config_sections_updated_at BEFORE UPDATE ON public.finance_config_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
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
CREATE POLICY "finance reference super admin" ON public.finance_reference_items FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE TRIGGER finance_reference_items_updated_at BEFORE UPDATE ON public.finance_reference_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
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
CREATE POLICY "finance rules super admin" ON public.finance_rules FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE TRIGGER finance_rules_updated_at BEFORE UPDATE ON public.finance_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
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
CREATE POLICY "finance audit read" ON public.finance_config_audit FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "finance audit insert" ON public.finance_config_audit FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE INDEX finance_config_audit_lookup ON public.finance_config_audit (school_id, created_at DESC);