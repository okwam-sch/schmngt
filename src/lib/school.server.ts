import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The provisioned school every module is scoped to: the earliest active
 * school (falling back to the earliest school). One resolver so overview,
 * finance, archives and data-access rules never disagree on "the school".
 */
export async function resolveProvisionedSchool(
  supabase: SupabaseClient | any,
): Promise<{ id: string; name: string; currency: string; locale: string } | null> {
  const { data: schoolId, error } = await supabase.rpc('active_school_id');
  if (error) throw new Error('Could not verify school membership.');
  if (!schoolId) return null;
  const { data } = await supabase
    .from("schools")
    .select("id, name, currency, locale")
    .eq('id', schoolId)
    .maybeSingle();
  return (data as any) ?? null;
}
