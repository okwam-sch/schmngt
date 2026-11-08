import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve the database-authorized active school for this request. Never
 * infer school access from browser preferences or choose a directory row.
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
