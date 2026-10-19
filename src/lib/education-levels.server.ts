/** Server lookups for education-level enforcement. Rules live in education-levels.ts. */
export async function classLevelCode(supabase: any, className: string | null | undefined): Promise<string | null> {
  if (!className) return null;
  const { data, error } = await supabase
    .from("school_classes")
    .select("level_code")
    .ilike("name", className.trim())
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.level_code as string | undefined) ?? null;
}
