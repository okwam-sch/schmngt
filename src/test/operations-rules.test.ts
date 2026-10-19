import { describe, it, expect } from "vitest";
import { defaultOpsRules, opsList, opsRulesSchema, opsValue, parseOpsRules } from "@/lib/operations-rules";
import { admissionNumberingSchema, employeeNumberingSchema } from "@/lib/config.schemas";

describe("operations rules", () => {
  it("defaults are valid and version 0", () => {
    expect(opsRulesSchema.safeParse(defaultOpsRules()).success).toBe(true);
    expect(parseOpsRules(undefined).version).toBe(0);
  });
  it("deleted rule is not applied", () => {
    const r = defaultOpsRules();
    r.library = r.library.filter((x) => x.key !== "loan-days");
    expect(opsValue(r, "library", "loan-days")).toBeNull();
  });
  it("emptied list falls back to defaults", () => {
    expect(opsList({ ...defaultOpsRules(), genders: [] }, "genders")).toContain("Female");
  });
  it("rejects duplicate list items", () => {
    expect(opsRulesSchema.safeParse({ ...defaultOpsRules(), audiences: ["Staff", "staff"] }).success).toBe(false);
  });
  it("admission and employee numbering validate independently", () => {
    const id = "00000000-0000-4000-8000-000000000000";
    expect(admissionNumberingSchema.safeParse({ schoolId: id, admissionFormat: "{SCHOOL}{YY}{SEQ}", admissionTotalDigits: 10, admissionYearDigits: 2, admissionSequenceDigits: 4, admissionSequenceStart: 1 }).success).toBe(true);
    expect(employeeNumberingSchema.safeParse({ schoolId: id, schoolCode: "12", employeeFormat: "{SEQ}", employeeTotalDigits: 7, employeeYearDigits: 2, employeeSequenceDigits: 1, employeeSequenceStart: 1, employeeAllocationMode: "compact" }).success).toBe(false);
  });
});
