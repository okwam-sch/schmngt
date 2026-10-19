import { describe, expect, it } from "vitest";
import { summariseAttendance, summariseScores, isAttended } from "@/lib/student-summary";
import { categoryOf, defaultRules, activeAssessmentTypes, parseRules } from "@/lib/academic-rules";
import { nextPeriod, type AcademicCalendar } from "@/lib/academic-calendar";
import { assertTeaches } from "@/lib/teaching.server";

const cal: AcademicCalendar = {
  mode: "term", academicYear: "2026/2027", graceDays: 14, lockAfterGrace: true, version: 0,
  periods: [
    { name: "Term 2", start: "2027-01-05", end: "2027-04-01" },
    { name: "Term 1", start: "2026-09-01", end: "2026-12-15" },
  ],
};

describe("student summaries", () => {
  it("counts present and late as attended, case-insensitively, per period", () => {
    const r = summariseAttendance(
      [
        { attendance_date: "2026-09-02", status: "Present" },
        { attendance_date: "2026-09-03", status: "late" },
        { attendance_date: "2026-09-04", status: "Absent" },
        { attendance_date: "2027-01-06", status: "Present" },
      ],
      cal,
    );
    expect(r.overall.rate).toBe(75);
    expect(r.periods.map((p) => p.period)).toEqual(["Term 2", "Term 1"]);
    expect(r.periods[1]?.rate).toBe(67);
    expect(isAttended("PRESENT")).toBe(true);
  });

  it("averages scores as percentages", () => {
    const r = summariseScores([
      { term: "Term 1", subject: "Maths", score: 8, outOf: 10 },
      { term: "Term 1", subject: "English", score: 30, outOf: 50 },
    ]);
    expect(r.average).toBe(70);
    expect(r.terms[0]?.subjects).toHaveLength(2);
  });
});

describe("assessment types", () => {
  it("come from academic rules with categories, and old rules get defaults", () => {
    const rules = defaultRules();
    expect(activeAssessmentTypes(rules)).toContain("Quiz");
    expect(categoryOf(rules, "exam")).toBe("exam");
    expect(categoryOf(rules, "Homework")).toBe("class");
    const legacy = { ...defaultRules() } as Record<string, unknown>;
    delete legacy["assessmentTypes"];
    expect(parseRules(legacy).assessmentTypes.length).toBeGreaterThan(0);
  });
});

describe("calendar and teaching scope", () => {
  it("finds the following period by date", () => {
    expect(nextPeriod(cal, "Term 1")?.start).toBe("2027-01-05");
    expect(nextPeriod(cal, "Term 2")).toBeNull();
  });
  it("limits teachers to assigned class + subject pairs", () => {
    const scope = { isAdmin: false, role: "staff", pairs: [{ class_name: "JHS 1", subject: "Maths" }], classes: ["JHS 1"], subjects: ["Maths"] };
    expect(() => assertTeaches(scope, "JHS 1", "Maths")).not.toThrow();
    expect(() => assertTeaches(scope, "JHS 1", "English")).toThrow();
    expect(() => assertTeaches({ ...scope, isAdmin: true }, "X", "Y")).not.toThrow();
  });
});
