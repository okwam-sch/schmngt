import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The provisioned school every module is scoped to: the earliest active
 * school (falling back to the earliest school). One resolver so overview,
 * finance, archives and data-access rules never disagree on "the school".
 */
export async function resolveProvisionedSchool(
  supabase: SupabaseClient | any,
): Promise<{ id: string; name: string; currency: string; locale: string } | null> {
  const { data } = await supabase
    .from("schools")
    .select("id, name, currency, locale")
    .order("active", { ascending: false })
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return (data as any) ?? null;
}
