CREATE OR REPLACE FUNCTION public.get_public_branding()
RETURNS TABLE(name text, tagline text, logo_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(NULLIF(btrim(b.display_name), ''), s.name)::text,
         COALESCE(b.tagline, '')::text,
         b.logo_url::text
  FROM public.schools s
  LEFT JOIN public.school_branding b ON b.school_id = s.id
  ORDER BY s.active DESC, s.created_at ASC
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_public_branding() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_branding() TO anon, authenticated, service_role;