import { describe, it, expect } from "vitest";
import { assessmentWeights, attendanceBackdateReason, defaultRules, gradeFromBands, rulesSchema } from "@/lib/academic-rules";

describe("academic rules", () => {
  it("defaults to a 50/50 class/exam split", () => {
    expect(assessmentWeights(defaultRules())).toEqual({ classWeight: 50, examWeight: 50 });
  });
  it("a deleted weight takes the remainder", () => {
    const r = defaultRules();
    r.assessment = r.assessment.map((x) => (x.key === "class-weight" ? { ...x, value: 40 } : x)).filter((x) => x.key !== "exam-weight");
    expect(assessmentWeights(r)).toEqual({ classWeight: 40, examWeight: 60 });
  });
  it("rejects weights not adding to 100", () => {
    const r = defaultRules();
    r.assessment = r.assessment.map((x) => (x.key === "class-weight" ? { ...x, value: 30 } : x));
    expect(rulesSchema.safeParse(r).success).toBe(false);
  });
  it("uses default grade bands", () => {
    expect(gradeFromBands(defaultRules().gradeBands, 85).grade).toBe("A");
  });
  it("blocks registers older than 7 days by default, none when deleted", () => {
    const r = defaultRules();
    expect(attendanceBackdateReason(r, "2026-10-01", "2026-10-10")).not.toBeNull();
    expect(attendanceBackdateReason(r, "2026-10-04", "2026-10-10")).toBeNull();
    r.attendance = r.attendance.filter((x) => x.key !== "backdate-days");
    expect(attendanceBackdateReason(r, "2020-01-01", "2026-10-10")).toBeNull();
  });
});
