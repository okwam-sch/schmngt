ALTER TABLE public.school_branding ADD COLUMN IF NOT EXISTS established_year text NOT NULL DEFAULT '';
ALTER TABLE public.school_branding ADD COLUMN IF NOT EXISTS motto text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

CREATE OR REPLACE FUNCTION public.get_public_branding_full()
 RETURNS TABLE(name text, tagline text, logo_url text, primary_color text, accent_color text, established_year text, motto text, language text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(NULLIF(btrim(b.display_name), ''), s.name)::text,
         COALESCE(b.tagline, '')::text, b.logo_url::text,
         COALESCE(b.primary_color, '')::text, COALESCE(b.accent_color, '')::text,
         COALESCE(b.established_year, '')::text, COALESCE(b.motto, '')::text,
         COALESCE(b.language, 'en')::text
  FROM public.schools s
  LEFT JOIN public.school_branding b ON b.school_id = s.id
  ORDER BY s.active DESC, s.created_at ASC
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.get_public_branding_full() TO anon, authenticated;

CREATE POLICY "branding public read" ON storage.objects FOR SELECT USING (bucket_id = 'branding');
CREATE POLICY "branding super admin insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding' AND name LIKE 'logo/%' AND private.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "branding super admin update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'branding' AND private.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "branding super admin delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'branding' AND private.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "avatars own insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding' AND name LIKE ('avatars/' || auth.uid()::text || '/%'));
CREATE POLICY "avatars own update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'branding' AND name LIKE ('avatars/' || auth.uid()::text || '/%'));
CREATE POLICY "avatars own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'branding' AND name LIKE ('avatars/' || auth.uid()::text || '/%'));