import { describe, expect, it } from "vitest";
import { assertCanManageAccount } from "@/lib/admin.server";

/** Fake Supabase client serving fixed role rows per user. */
function fakeSupabase(roles: Record<string, string[]>) {
  return {
    from: (table: string) => {
      if (table !== "user_roles" && table !== "profiles") throw new Error(`unexpected ${table}`);
      return {
        select: () => ({
          eq: async (_col: string, id: string) => ({
            data:
              table === "user_roles"
                ? (roles[id] ?? []).map((role) => ({ role }))
                : roles[id]?.length
                  ? null
                  : [{ role: "staff" }],
          }),
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
});
