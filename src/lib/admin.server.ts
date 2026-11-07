import type { SupabaseClient } from "@supabase/supabase-js";

const ADMIN_ROLES = new Set(["super_admin", "school_manager"]);

/**
 * Reads the caller's roles. The role-check helpers live in a private schema and
 * are not exposed through the API, so we read the role rows directly (the
 * caller can always read their own roles under RLS) and fall back to the
 * profile role. Super Admin is never restricted anywhere in the app.
 */
export async function getRoles(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const roles = new Set<string>();

  const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  for (const row of roleRows ?? []) {
    if (row?.role) roles.add(row.role as string);
  }

  if (!roles.has('super_admin')) {
    const { data: effective, error } = await supabase.rpc('school_role');
    if (error) throw new Error('Could not verify school permissions.');
    return effective ? [effective] : [];
  }

  return [...roles];
}

export async function isSuperAdmin(supabase: SupabaseClient, userId: string) {
  return (await getRoles(supabase, userId)).includes("super_admin");
}

export async function isAdmin(supabase: SupabaseClient, userId: string) {
  return (await getRoles(supabase, userId)).some((r) => ADMIN_ROLES.has(r));
}

export async function assertAdmin(supabase: SupabaseClient, userId: string) {
  if (!(await isAdmin(supabase, userId))) {
    throw new Error("Forbidden: administrator access required.");
  }
}

export async function assertSuperAdmin(supabase: SupabaseClient, userId: string) {
  if (!(await isSuperAdmin(supabase, userId))) {
    throw new Error("Forbidden: Super Admin access required.");
  }
}

/**
 * Guards account administration against privilege escalation: a School
 * Manager may manage ordinary accounts, but only a Super Admin may modify,
 * suspend, or reset the password of an account that holds an administrator
 * role. Super Admins pass unconditionally.
 */
export async function assertCanManageAccount(
  supabase: SupabaseClient,
  callerId: string,
  targetUserId: string,
) {
  if (await isSuperAdmin(supabase, callerId)) return;
  const { data: target, error } = await supabase.from('profiles').select('id').eq('id', targetUserId).maybeSingle();
  if (error || !target) throw new Error('Forbidden: account is outside your school.');
  const { data: shared, error: membershipError } = await supabase.from('school_memberships').select('school_id, role').eq('user_id', targetUserId);
  if (membershipError || (shared?.length ?? 0) !== 1) throw new Error('Only a Super Admin can modify an identity shared between schools.');
  const { data: targetRoleRows, error: targetRoleError } = await supabase.from('user_roles').select('role').eq('user_id', targetUserId);
  if (targetRoleError) throw new Error('Could not verify target privileges.');
  const targetRoles = (targetRoleRows ?? []).map(r => r.role);
  if (targetRoles.some((r) => ADMIN_ROLES.has(r)) || shared?.some(m => ADMIN_ROLES.has(m.role))) {
    throw new Error("Forbidden: only a Super Admin can modify an administrator account.");
  }
}

export async function logAudit(
  supabase: SupabaseClient,
  actorId: string,
  entry: {
    action: string;
    description: string;
    targetUserId?: string | null;
    targetEmail?: string | null;
    details?: Record<string, unknown>;
  },
) {
  const { data: actor } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", actorId)
    .maybeSingle();

  await supabase.from("audit_logs").insert({
    action: entry.action,
    description: entry.description,
    actor_id: actorId,
    actor_email: (actor as { email?: string } | null)?.email ?? null,
    target_user_id: entry.targetUserId ?? null,
    target_email: entry.targetEmail ?? null,
    details: entry.details ?? {},
  });
}

export const ACCOUNT_COLUMNS =
  "id, full_name, email, username, role, access_level, status, gender, department, class_name, two_factor_enabled, permissions, force_password_change, last_login, created_at, phone, position, employee_id, admission_number, salary, start_date";
