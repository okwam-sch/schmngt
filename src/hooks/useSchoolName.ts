import { useQuery } from "@tanstack/react-query";
import { brandingQueryOptions, DEFAULT_SCHOOL_NAME, type PublicBranding } from "@/lib/branding.functions";
import { getSchoolBranding } from '@/lib/branding.functions';
import { useActiveSchool } from './useActiveSchool';
import { useServerFn } from '@tanstack/react-start';
import { useRouter } from '@tanstack/react-router';

export { DEFAULT_SCHOOL_NAME };

/** The one source for school branding on screen (name, tagline, logo, colours…), cached under ["branding"]. */
export function useSchoolName(): PublicBranding {
  const school = useActiveSchool();
  const load = useServerFn(getSchoolBranding);
  const router = useRouter();
  const publicBranding = router.state.matches[0]?.context.branding as PublicBranding | undefined;
  const { data } = useQuery(school?.school ? { queryKey: ['school-branding', school.school.id], queryFn: () => load() } : brandingQueryOptions);
  const brand = school?.school ? data : data ?? publicBranding;
  return {
    name: brand?.name || DEFAULT_SCHOOL_NAME,
    tagline: brand?.tagline ?? "",
    logoUrl: brand?.logoUrl ?? null,
    primaryColor: brand?.primaryColor ?? "",
    accentColor: brand?.accentColor ?? "",
    establishedYear: brand?.establishedYear ?? "",
    motto: brand?.motto ?? "",
    language: brand?.language ?? "en",
  };
}
