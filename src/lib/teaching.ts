/**
 * Staff positions.
 *
 * "Teacher" and "Non-Teaching" are platform-level positions: every school has
 * them and modules key behaviour off them, so they are hardcoded here and
 * merged ahead of whatever extra positions a tenant configures under System
 * Configuration → Tenant policy.
 */
export const TEACHER_POSITION = "Teacher";
export const NON_TEACHING_POSITION = "Non-Teaching";

export const CORE_POSITIONS = [TEACHER_POSITION, NON_TEACHING_POSITION];

export const isTeacherPosition = (position: string | null | undefined) =>
  (position ?? "").trim().toLowerCase() === TEACHER_POSITION.toLowerCase();

/** Core positions first, then the tenant's own list, without duplicates. */
export function mergePositions(tenantPositions: string[] | null | undefined) {
  const seen = new Set(CORE_POSITIONS.map((p) => p.toLowerCase()));
  const extra = (tenantPositions ?? []).filter((p) => {
    const key = p.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...CORE_POSITIONS, ...extra];
}

export interface TeachingAssignment {
  id: string;
  teacher_id: string;
  class_name: string;
  subject: string;
}

/** Group assignments into the distinct classes and subjects they cover. */
export function splitAssignments(rows: { class_name: string; subject: string }[]) {
  return {
    classes: [...new Set(rows.map((r) => r.class_name))],
    subjects: [...new Set(rows.map((r) => r.subject))],
  };
}
