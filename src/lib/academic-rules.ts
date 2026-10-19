/* ------------------------------------------------------------------ *
 * Academic rules: the single place for grading bands and assessment,
 * attendance, timetable and report-card rules. Stored in
 * tenant_settings.features under RULES_FEATURE_KEY. Every rule ships with
 * a default and may be deleted; a deleted rule simply stops applying.
 * Browser-safe; read by Academic Configuration, the modules and servers.
 * ------------------------------------------------------------------ */
import { z } from "zod";

export const RULES_FEATURE_KEY = "__academic_rules";

export const RULE_SECTIONS = ["assessment", "attendance", "timetable", "reportCard"] as const;
export type RuleSection = (typeof RULE_SECTIONS)[number];

export const SECTION_LABEL: Record<RuleSection, { title: string; summary: string; modules: string[] }> = {
  assessment: { title: "Assessment rules", summary: "Class work and exam split, pass mark and scoring.", modules: ["assessment", "exams-quizzes", "results"] },
  attendance: { title: "Attendance rules", summary: "Register cut-offs, late entries and absence thresholds.", modules: ["attendance"] },
  timetable: { title: "Timetable rules", summary: "School day, lesson lengths and breaks.", modules: ["timetable"] },
  reportCard: { title: "Report card rules", summary: "What report cards show and promotion marks.", modules: ["termly-reports", "performance-tracker"] },
};

const ruleSchema = z.object({
  key: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(120),
  value: z.union([z.number(), z.string().max(200), z.boolean()]),
  unit: z.string().max(20).optional(),
});
export type AcademicRule = z.infer<typeof ruleSchema>;

const bandSchema = z.object({
  min: z.number().min(0).max(100),
  grade: z.string().trim().min(1).max(8),
  level: z.string().trim().max(60),
});
export type GradeBand = z.infer<typeof bandSchema>;

/** How an assessment type counts towards the subject total. */
export const ASSESSMENT_CATEGORIES = ["class", "exam"] as const;
export type AssessmentCategory = (typeof ASSESSMENT_CATEGORIES)[number];
export const CATEGORY_LABEL: Record<AssessmentCategory, string> = { class: "Class work", exam: "Exam" };

const assessmentTypeSchema = z.object({
  name: z.string().trim().min(1).max(40),
  category: z.enum(ASSESSMENT_CATEGORIES),
  active: z.boolean().default(true),
});
export type AssessmentTypeRule = z.infer<typeof assessmentTypeSchema>;

export const DEFAULT_ASSESSMENT_TYPES: AssessmentTypeRule[] = [
  { name: "Exam", category: "exam", active: true },
  { name: "Homework", category: "class", active: true },
  { name: "Project", category: "class", active: true },
  { name: "Exercise", category: "class", active: true },
  { name: "Quiz", category: "class", active: true },
  { name: "Assignment", category: "class", active: true },
];

export const rulesSchema = z
  .object({
    gradeBands: z.array(bandSchema).max(20),
    /** Assessment types offered by Assessment and weighted by Termly Reports. */
    assessmentTypes: z.array(assessmentTypeSchema).max(30).default(DEFAULT_ASSESSMENT_TYPES.map((t) => ({ ...t }))),
    assessment: z.array(ruleSchema).max(30),
    attendance: z.array(ruleSchema).max(30),
    timetable: z.array(ruleSchema).max(30),
    reportCard: z.array(ruleSchema).max(30),
    /** Optimistic-concurrency version; bumped by the server on every save. */
    version: z.number().int().min(0).default(0),
  })
  .refine((r) => new Set(r.gradeBands.map((b) => b.min)).size === r.gradeBands.length, {
    message: "Two grade bands share the same minimum score",
  })
  .refine((r) => new Set(r.assessmentTypes.map((t) => t.name.toLowerCase())).size === r.assessmentTypes.length, {
    message: "Two assessment types share the same name",
  })
  .refine(
    (r) => {
      const c = num(r, "assessment", "class-weight");
      const e = num(r, "assessment", "exam-weight");
      return c === null || e === null || c + e === 100;
    },
    { message: "Class work and exam weights must add up to 100" },
  );
export type AcademicRules = z.infer<typeof rulesSchema>;

export const DEFAULT_GRADE_BANDS: GradeBand[] = [
  { min: 90, grade: "A+", level: "Excellent" },
  { min: 80, grade: "A", level: "Very Good" },
  { min: 70, grade: "B+", level: "Good" },
  { min: 60, grade: "B", level: "Fair" },
  { min: 50, grade: "C", level: "Average" },
  { min: 40, grade: "D", level: "Poor" },
  { min: 0, grade: "F", level: "Fail" },
];

export const DEFAULT_RULES: Record<RuleSection, AcademicRule[]> = {
  assessment: [
    { key: "class-weight", label: "Class work weight", value: 50, unit: "%" },
    { key: "exam-weight", label: "Exam weight", value: 50, unit: "%" },
    { key: "pass-mark", label: "Pass mark", value: 50, unit: "%" },
    { key: "default-out-of", label: "Default score out of", value: 100 },
    { key: "min-class-tasks", label: "Minimum class tasks per subject", value: 3 },
  ],
  attendance: [
    { key: "late-after", label: "Mark late after", value: "08:00" },
    { key: "backdate-days", label: "Days a past register can still be entered", value: 7, unit: "days" },
    { key: "absence-alert", label: "Alert after absences in a row", value: 3, unit: "days" },
    { key: "min-attendance", label: "Minimum attendance expected", value: 75, unit: "%" },
  ],
  timetable: [
    { key: "day-start", label: "School day starts", value: "07:30" },
    { key: "lesson-length", label: "Lesson length", value: 40, unit: "min" },
    { key: "lessons-per-day", label: "Lessons per day", value: 8 },
    { key: "break-length", label: "Break length", value: 30, unit: "min" },
  ],
  reportCard: [
    { key: "show-position", label: "Show class position", value: true },
    { key: "show-attendance", label: "Show attendance", value: true },
    { key: "show-bill", label: "Show fee bill", value: true },
    { key: "promotion-mark", label: "Promotion average", value: 50, unit: "%" },
  ],
};

export function defaultRules(): AcademicRules {
  return {
    gradeBands: DEFAULT_GRADE_BANDS.map((b) => ({ ...b })),
    assessmentTypes: DEFAULT_ASSESSMENT_TYPES.map((t) => ({ ...t })),
    assessment: DEFAULT_RULES.assessment.map((r) => ({ ...r })),
    attendance: DEFAULT_RULES.attendance.map((r) => ({ ...r })),
    timetable: DEFAULT_RULES.timetable.map((r) => ({ ...r })),
    reportCard: DEFAULT_RULES.reportCard.map((r) => ({ ...r })),
    version: 0,
  };
}

/** Stored rules, or the defaults when none are saved / the data is malformed. */
export function parseRules(raw: unknown): AcademicRules {
  const r = rulesSchema.safeParse(raw);
  return r.success ? r.data : defaultRules();
}

export function findRule(r: AcademicRules, section: RuleSection, key: string) {
  return r[section].find((x) => x.key === key) ?? null;
}

/** Numeric rule value, or null when the rule was deleted. */
export function num(r: Pick<AcademicRules, RuleSection>, section: RuleSection, key: string): number | null {
  const v = r[section].find((x) => x.key === key)?.value;
  return typeof v === "number" ? v : null;
}

/** Boolean rule value; deleted rules count as off. */
export function flag(r: AcademicRules, section: RuleSection, key: string) {
  return findRule(r, section, key)?.value === true;
}

/** Class/exam split. A deleted weight takes the remainder; both deleted = 50/50. */
export function assessmentWeights(r: AcademicRules) {
  const c = num(r, "assessment", "class-weight");
  const e = num(r, "assessment", "exam-weight");
  if (c === null && e === null) return { classWeight: 50, examWeight: 50 };
  if (c === null) return { classWeight: 100 - e!, examWeight: e! };
  if (e === null) return { classWeight: c, examWeight: 100 - c };
  return { classWeight: c, examWeight: e };
}

/** Grade for a total; with every band deleted, no grade is given. */
export function gradeFromBands(bands: GradeBand[], total: number) {
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return sorted.find((b) => total >= b.min) ?? { min: 0, grade: "—", level: "" };
}

/** Why a register date is too old to enter, or null. */
export function attendanceBackdateReason(r: AcademicRules, date: string, today = new Date().toISOString().slice(0, 10)) {
  const days = num(r, "attendance", "backdate-days");
  if (days === null) return null;
  const diff = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
  return diff > days ? `Registers older than ${days} day${days === 1 ? "" : "s"} can no longer be entered.` : null;
}

/** Defaults missing from a section (so a deleted rule can be restored). */
export function missingDefaults(r: AcademicRules, section: RuleSection) {
  return DEFAULT_RULES[section].filter((d) => !r[section].some((x) => x.key === d.key));
}

/** Assessment types a teacher may pick (active only, configured order). */
export function activeAssessmentTypes(r: Pick<AcademicRules, "assessmentTypes">) {
  return r.assessmentTypes.filter((t) => t.active).map((t) => t.name);
}

/**
 * Category of a recorded assessment type. Unknown/removed types fall back to
 * "exam" only when literally named "Exam", so historic rows keep weighting.
 */
export function categoryOf(r: Pick<AcademicRules, "assessmentTypes">, type: string): AssessmentCategory {
  const t = r.assessmentTypes.find((x) => x.name.toLowerCase() === type.trim().toLowerCase());
  return t ? t.category : type.trim().toLowerCase() === "exam" ? "exam" : "class";
}

/** Score as a percentage of its maximum. */
export function percentOf(score: number, outOf: number) {
  return outOf > 0 ? (score / outOf) * 100 : 0;
}
