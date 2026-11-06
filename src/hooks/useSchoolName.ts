import { useQuery } from "@tanstack/react-query";
import { brandingQueryOptions, DEFAULT_SCHOOL_NAME, type PublicBranding } from "@/lib/branding.functions";
import { getSchoolBranding } from '@/lib/branding.functions';
import { useActiveSchool } from './useActiveSchool';
import { useServerFn } from '@tanstack/react-start';

export { DEFAULT_SCHOOL_NAME };

/** The one source for school branding on screen (name, tagline, logo, colours…), cached under ["branding"]. */
export function useSchoolName(): PublicBranding {
  const school = useActiveSchool();
  const load = useServerFn(getSchoolBranding);
  const { data } = useQuery(school?.school ? { queryKey: ['school-branding', school.school.id], queryFn: () => load() } : brandingQueryOptions);
  return {
    name: data?.name || DEFAULT_SCHOOL_NAME,
    tagline: data?.tagline ?? "",
    logoUrl: data?.logoUrl ?? null,
    primaryColor: data?.primaryColor ?? "",
    accentColor: data?.accentColor ?? "",
    establishedYear: data?.establishedYear ?? "",
    motto: data?.motto ?? "",
    language: data?.language ?? "en",
  };
}
