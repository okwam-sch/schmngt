ALTER FUNCTION public.provision_school(jsonb,jsonb) SET SCHEMA private;
CREATE FUNCTION public.provision_school(_school jsonb,_settings jsonb) RETURNS public.schools LANGUAGE sql SET search_path=public AS $$ SELECT private.provision_school(_school,_settings) $$;
REVOKE ALL ON FUNCTION public.provision_school(jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.provision_school(jsonb,jsonb) TO authenticated;