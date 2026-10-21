import {
  assessmentWeights,
  categoryOf,
  gradeFromBands,
  percentOf,
  type AcademicRules,
} from "@/lib/academic-rules";

export interface ScoreRecord {
  admissionId: string;
  subject: string;
  assessmentType: string;
  score: number;
  outOf: number;
}

/** Same aggregation for termly reports and the on-demand assessment report. */
export function assessmentTotals(rows: ScoreRecord[], rules: AcademicRules) {
  const grouped = new Map<string, Map<string, { c: number[]; e: number[] }>>();
  for (const row of rows) {
    const subjects =
      grouped.get(row.admissionId) ?? new Map<string, { c: number[]; e: number[] }>();
    const cell = subjects.get(row.subject) ?? { c: [], e: [] };
    (categoryOf(rules, row.assessmentType) === "exam" ? cell.e : cell.c).push(
      percentOf(row.score, row.outOf),
    );
    subjects.set(row.subject, cell);
    grouped.set(row.admissionId, subjects);
  }
  const { classWeight, examWeight } = assessmentWeights(rules);
  const avg = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const totals = new Map<
    string,
    Map<
      string,
      {
        cls: number;
        exam: number;
        total: number;
        grade: string;
        level: string;
        classTasks: number;
        examTasks: number;
      }
    >
  >();
  for (const [id, subjects] of grouped) {
    const scores = new Map();
    for (const [subject, { c, e }] of subjects) {
      const cls = (avg(c) * classWeight) / 100;
      const exam = (avg(e) * examWeight) / 100;
      const total = cls + exam;
      const grade = gradeFromBands(rules.gradeBands, total);
      scores.set(subject, {
        cls,
        exam,
        total,
        grade: grade.grade,
        level: grade.level,
        classTasks: c.length,
        examTasks: e.length,
      });
    }
    totals.set(id, scores);
  }
  return totals;
}


export function assertStudentClass(actual: string, selected: string) {
  if (actual !== selected) throw new Error("The selected student does not belong to this class.");
}
