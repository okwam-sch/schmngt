import { describe, expect, it } from "vitest";
import { assertCanManageAccount, getRoles } from "@/lib/admin.server";

/** Fake Supabase client serving fixed role rows per user. */
function fakeSupabase(roles: Record<string, string[]>, options: { schoolRole?: string | null; shared?: number; visible?: boolean; memberRole?: string } = {}) {
  return {
    rpc: async () => ({ data: options.schoolRole === undefined ? 'school_manager' : options.schoolRole }),
    from: (table: string) => {
      if (!['user_roles','profiles','school_memberships'].includes(table)) throw new Error(`unexpected ${table}`);
      return {
        select: () => ({
          eq: (_col: string, id: string) => {
            const result = {
            data:
              table === "user_roles"
                ? (roles[id] ?? []).map((role) => ({ role }))
                : table === 'school_memberships' ? Array.from({ length: options.shared ?? 1 }, (_, i) => ({ school_id: `school-${i}`, role: options.memberRole ?? 'staff' })) : options.visible === false ? null : { id },
            };
            return { ...result, maybeSingle: async () => result };
          },
        }),
      };
    },
  } as any;
}

const MANAGER = "manager-1";
const SUPER = "super-1";
const TARGET_ADMIN = "target-admin";
const TARGET_STAFF = "target-staff";

const db = fakeSupabase({
  [MANAGER]: ["school_manager"],
  [SUPER]: ["super_admin"],
  [TARGET_ADMIN]: ["super_admin"],
  [TARGET_STAFF]: ["staff"],
});

describe("privileged account guard", () => {
  it("blocks a School Manager from modifying a Super Admin account", async () => {
    await expect(assertCanManageAccount(db, MANAGER, TARGET_ADMIN)).rejects.toThrow(
      /Super Admin/,
    );
  });
  it("lets a School Manager modify an ordinary staff account", async () => {
    await expect(assertCanManageAccount(db, MANAGER, TARGET_STAFF)).resolves.toBeUndefined();
  });
  it("lets a Super Admin modify any account, including administrators", async () => {
    await expect(assertCanManageAccount(db, SUPER, TARGET_ADMIN)).resolves.toBeUndefined();
    await expect(assertCanManageAccount(db, SUPER, TARGET_STAFF)).resolves.toBeUndefined();
  });
  it("treats a target holding any administrator role as privileged", async () => {
    const db2 = fakeSupabase({
      [MANAGER]: ["school_manager"],
      "target-mgr": ["school_manager"],
    });
    await expect(assertCanManageAccount(db2, MANAGER, "target-mgr")).rejects.toThrow(
      /Super Admin/,
    );
  });
  it('blocks a manager from modifying an identity shared between two schools', async () => {
    await expect(assertCanManageAccount(fakeSupabase({ [MANAGER]: ['school_manager'] }, { shared: 2 }), MANAGER, TARGET_STAFF)).rejects.toThrow(/shared between schools/);
  });
  it('blocks an account outside the selected school', async () => {
    await expect(assertCanManageAccount(fakeSupabase({ [MANAGER]: ['school_manager'] }, { visible: false }), MANAGER, TARGET_STAFF)).rejects.toThrow(/outside your school/);
  });
  it('uses the selected school role rather than a manager role from another school', async () => {
    expect(await getRoles(fakeSupabase({ [MANAGER]: ['school_manager'] }, { schoolRole: 'student' }), MANAGER)).toEqual(['student']);
  });
  it('denies school privileges without an active membership', async () => {
    expect(await getRoles(fakeSupabase({ [MANAGER]: ['school_manager'] }, { schoolRole: null }), MANAGER)).toEqual([]);
  });
  it('protects administrator memberships even when the global legacy role is staff', async () => {
    await expect(assertCanManageAccount(fakeSupabase({ [MANAGER]: ['school_manager'], [TARGET_STAFF]: ['staff'] }, { memberRole: 'school_manager' }), MANAGER, TARGET_STAFF)).rejects.toThrow(/Super Admin/);
  });
});
