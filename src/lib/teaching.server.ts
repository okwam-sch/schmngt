/**
 * Server-side teaching scope: the (class, subject) pairs a member of staff
 * is assigned to teach (teaching_assignments, set in User/Staff Management).
 * Distinct from class-teacher responsibility (class_teachers). Every module
 * that limits teachers to their own classes/subjects calls this.
 */
export interface TeachingScope {
  /** Administrators see and record everything. */
  isAdmin: boolean;
  role: string;
  pairs: { class_name: string; subject: string }[];
  classes: string[];
  subjects: string[];
}

export async function loadTeachingScope(supabase: any, userId: string): Promise<TeachingScope> {
  const { data: roles, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error("Could not verify teaching permissions.");
  const assigned = (roles ?? []).map((r: { role: string }) => r.role);
  const role: string = ["super_admin", "school_manager", "staff"].find((r) => assigned.includes(r)) ?? "";
  if (role === "super_admin" || role === "school_manager") {
    return { isAdmin: true, role, pairs: [], classes: [], subjects: [] };
  }
  if (role !== "staff") return { isAdmin: false, role, pairs: [], classes: [], subjects: [] };
  const { data } = await supabase
    .from("teaching_assignments")
    .select("class_name, subject")
    .eq("teacher_id", userId);
  const pairs = (data ?? []) as { class_name: string; subject: string }[];
  return {
    isAdmin: false,
    role,
    pairs,
    classes: [...new Set(pairs.map((p) => p.class_name))].sort(),
    subjects: [...new Set(pairs.map((p) => p.subject))].sort(),
  };
}

/** Refuse a write outside the caller's teaching scope. */
export function assertTeaches(scope: TeachingScope, className: string, subject: string) {
  if (scope.isAdmin) return;
  const ok = scope.pairs.some(
    (p) => p.class_name.toLowerCase() === className.trim().toLowerCase() && p.subject.toLowerCase() === subject.trim().toLowerCase(),
  );
  if (!ok) throw new Error(`You are not assigned to teach ${subject} in ${className || "this class"}.`);
}
