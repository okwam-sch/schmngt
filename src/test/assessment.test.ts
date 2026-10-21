import { describe, expect, it } from "vitest";
import { assessmentCsv, assessmentTotals, assertStudentClass } from "@/lib/assessment";
import { assessmentPageSchema } from "@/lib/assessment.schemas";
import { defaultRules } from "@/lib/academic-rules";
import { assertTeaches, loadTeachingScope } from "@/lib/teaching.server";

describe("selected database assessment", () => {
  it("requires class, subject and period for every paged read", () => {
    expect(assessmentPageSchema.safeParse({}).success).toBe(false);
    expect(assessmentPageSchema.parse({ className: "Form 1", subject: "Science", term: "Term 1" })).toMatchObject({ page: 0, pageSize: 100 });
  });
  it("rejects unbounded or negative pages", () => {
    const s = { className: "Form 1", subject: "Science", term: "Term 1" };
    expect(assessmentPageSchema.safeParse({ ...s, pageSize: 1001 }).success).toBe(false);
    expect(assessmentPageSchema.safeParse({ ...s, page: -1 }).success).toBe(false);
  });
  it("rejects cross-class learner writes", () => {
    expect(() => assertStudentClass("Form 2", "Form 1")).toThrow();
    expect(() => assertStudentClass("Form 1", "Form 1")).not.toThrow();
  });
  it("requires exact teaching pairs, not independent class/subject memberships", () => {
    const scope = { isAdmin: false, role: "staff", classes: ["Form 1", "Form 2"], subjects: ["Science", "Math"], pairs: [{ class_name: "Form 1", subject: "Science" }, { class_name: "Form 2", subject: "Math" }] };
    expect(() => assertTeaches(scope, "Form 1", "Math")).toThrow();
    expect(() => assertTeaches(scope, "Form 1", "Science")).not.toThrow();
  });
  it("takes privileges from protected roles, not editable profiles", async () => {
    const tables: string[] = [];
    const client = { from: (table: string) => { tables.push(table); return { select: () => ({ eq: async () => ({ data: table === "user_roles" ? [{ role: "student" }] : [{ role: "super_admin" }] }) }) }; } };
    expect((await loadTeachingScope(client, "student-id")).isAdmin).toBe(false);
    expect(tables).toEqual(["user_roles"]);
  });
  it("uses configured categories, weights and grades for the same weighted total", () => {
    const rules = defaultRules();
    rules.assessmentTypes = [{ name: "Practical", category: "exam", active: true }, { name: "Coursework", category: "class", active: true }];
    rules.assessment = rules.assessment.map((r) => r.key === "class-weight" ? { ...r, value: 40 } : r.key === "exam-weight" ? { ...r, value: 60 } : r);
    rules.gradeBands = [{ min: 70, grade: "G1", level: "Mastered" }, { min: 0, grade: "G2", level: "Developing" }];
    const row = { admissionId: "student", subject: "Science" };
    const total = assessmentTotals([{ ...row, assessmentType: "Coursework", score: 8, outOf: 10 }, { ...row, assessmentType: "Practical", score: 35, outOf: 50 }], rules).get("student")?.get("Science");
    expect(total).toMatchObject({ cls: 32, exam: 42, total: 74, grade: "G1", level: "Mastered" });
  });
  it("does not invent scores for missing exam records", () => {
    const total = assessmentTotals([{ admissionId: "s", subject: "Science", assessmentType: "Quiz", score: 80, outOf: 100 }], defaultRules()).get("s")?.get("Science");
    expect(total).toMatchObject({ cls: 40, exam: 0, total: 40, examTasks: 0 });
  });
  it("neutralizes formula cells and escapes commas and quotes", () => {
    expect(assessmentCsv([["=HYPERLINK(1)", 'A, "B"', 80]])).toBe('\uFEFF"\'=HYPERLINK(1)","A, ""B""","80"');
  });
});