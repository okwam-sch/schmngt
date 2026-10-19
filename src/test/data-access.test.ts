import { describe, expect, it } from "vitest";
import { allowedStates, canExport, parseAccessRules, parseExportControls } from "@/lib/data-access";
import { FINANCE_AREAS, areasOwnedBy } from "@/lib/finance-config";

const grants = parseAccessRules([
  { active: true, conditions: { roles: "school_manager", sources: "attendance", states: "current,archived" } },
  { active: false, conditions: { roles: "staff", sources: "*" } },
  { active: true, conditions: { roles: "", states: "current" } },
  { active: true, conditions: { roles: "staff", states: "bogus" } },
]);

describe("data access rules", () => {
  it("super admin sees every state of every source", () => {
    expect(allowedStates(["super_admin"], [], "fees").size).toBe(3);
  });
  it("denies by default and ignores inactive or malformed rules", () => {
    expect(grants).toHaveLength(1);
    expect(allowedStates(["staff"], grants, "attendance").size).toBe(0);
    expect(allowedStates(["school_manager"], grants, "fees").size).toBe(0);
  });
  it("grants only the listed states for the listed source", () => {
    expect([...allowedStates(["school_manager"], grants, "attendance")].sort()).toEqual(["archived", "current"]);
  });
  it("export needs exports on and the role listed", () => {
    const on = parseExportControls({ allow_export: "yes", export_roles: "school_manager", watermark: "yes" });
    expect(canExport(["school_manager"], on)).toBe(true);
    expect(canExport(["staff"], on)).toBe(false);
    expect(canExport(["school_manager"], parseExportControls({ allow_export: "no", export_roles: "school_manager" }))).toBe(false);
    expect(canExport(["super_admin"], parseExportControls({}))).toBe(true);
    expect(on.watermark).toBe(true);
  });
});

describe("configuration numbering", () => {
  it("areas are numbered consecutively from 01 with no suffixes", () => {
    FINANCE_AREAS.forEach((a, i) => expect(a.number).toBe(String(i + 1).padStart(2, "0")));
  });
  it("data access rules have one home", () => {
    const keys = FINANCE_AREAS.flatMap((a) => a.sections.map((s) => s.key));
    expect(keys).not.toContain("data-access-rules");
    expect(areasOwnedBy("reporting-configuration").map((a) => a.number)).toEqual(["14", "15", "16"]);
  });
});
