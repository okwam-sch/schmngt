import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CALENDAR_FEATURE_KEY, findPeriod, nextPeriod, parseCalendar } from "@/lib/academic-calendar";
import { isAttended } from "@/lib/student-summary";
import { buildBill, rankOf } from "@/lib/reports";
import { assessmentTotals } from "@/lib/assessment";
import { RULES_FEATURE_KEY, assessmentWeights, flag, gradeFromBands, num, parseRules } from "@/lib/academic-rules";

const STAFF_ROLES = ["super_admin", "school_manager", "staff"];

async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!data || !STAFF_ROLES.includes(data.role)) throw new Error("Forbidden");
}

/** Students and the terms that have assessment records. */
export const getReportOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const [students, terms] = await Promise.all([
      context.supabase
        .from("admissions")
        .select("id, admission_number, student_name, class_admitted")
        .order("student_name"),
      context.supabase.from("student_assessments").select("term").limit(5000),
    ]);
    if (students.error) throw new Error(students.error.message);
    return {
      students: students.data ?? [],
      terms: [...new Set((terms.data ?? []).map((t) => t.term))].sort(),
    };
  });

/** Build one learner's termly report from Assessment, Attendance and Financial Management. */
export const getTermlyReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ admissionId: z.string().uuid(), term: z.string().min(1).max(60) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertStaff(supabase, context.userId);

    const { data: student, error } = await supabase
      .from("admissions")
      .select("id, admission_number, student_name, class_admitted")
      .eq("id", data.admissionId)
      .single();
    if (error) throw new Error(error.message);

    const { data: classmates } = await supabase
      .from("admissions")
      .select("id")
      .eq("class_admitted", student.class_admitted);
    const classIds = (classmates ?? []).map((c) => c.id);

    const [assess, attendance, fees] = await Promise.all([
      supabase
        .from("student_assessments")
        .select("admission_id, subject, assessment_type, score, out_of, created_at")
        .eq("term", data.term)
        .in("admission_id", classIds.length ? classIds : [student.id]),
      supabase
        .from("student_attendance")
        .select("status, attendance_date")
        .eq("admission_id", student.id),
      supabase
        .from("student_fees")
        .select("term, amount_due, amount_paid, created_at")
        .eq("admission_id", student.id),
    ]);
    if (assess.error) throw new Error(assess.error.message);

    const { data: ts } = await supabase
      .from("tenant_settings")
      .select("features")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const rules = parseRules((ts?.features as Record<string, unknown> | null)?.[RULES_FEATURE_KEY]);
    const { classWeight: CLASS_WEIGHT, examWeight: EXAM_WEIGHT } = assessmentWeights(rules);

    // Per student, per subject: average % for class work and for exams, scaled to weights.
    const totals = assessmentTotals((assess.data ?? []).map((r) => ({ admissionId: r.admission_id, subject: r.subject, assessmentType: r.assessment_type, score: Number(r.score), outOf: Number(r.out_of) })), rules);

    const mine = totals.get(student.id) ?? new Map();
    const subjects = [...mine.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([subject, s]) => {
        const peers = [...totals.values()].map((m) => m.get(subject)?.total).filter((x): x is number => x !== undefined);
        const g = gradeFromBands(rules.gradeBands, s.total);
        return {
          subject,
          classScore: s.cls,
          examScore: s.exam,
          total: s.total,
          position: rankOf(s.total, peers),
          grade: g.grade,
          level: g.level,
        };
      });

    const overall = [...totals.values()].map((m) => [...m.values()].reduce((s, x) => s + x.total, 0));
    const myOverall = subjects.reduce((s, x) => s + x.total, 0);

    // Attendance has no term column — derive the term's date range from when
    // its assessment scores were recorded, then count attendance inside it.
    const dates = (assess.data ?? [])
      .map((r) => r.created_at)
      .filter((d): d is string => !!d)
      .sort();
    // Prefer the configured calendar's date range; fall back to the score dates.
    const rawCal = (ts?.features as Record<string, unknown> | null)?.[CALENDAR_FEATURE_KEY];
    const cal = rawCal ? parseCalendar(rawCal) : null;
    const period = cal ? findPeriod(cal, data.term) : null;
    const next = cal ? nextPeriod(cal, data.term) : null;
    const termStart = period?.start ?? dates[0]?.slice(0, 10);
    const termEnd = period?.end ?? dates[dates.length - 1]?.slice(0, 10);
    const att = (attendance.data ?? []).filter(
      (a) =>
        !termStart ||
        !termEnd ||
        (a.attendance_date >= termStart && a.attendance_date <= termEnd),
    );
    return {
      student,
      term: data.term,
      subjects,
      position: subjects.length ? rankOf(myOverall, overall) : null,
      numberOnRoll: classIds.length,
      /** Start of the following term/semester from the academic calendar. */
      nextPeriod: next ? { name: next.name, start: next.start } : null,
      attendance: {
        present: att.filter((a) => isAttended(a.status)).length,
        total: att.length,
      },
      bill: fees.error ? null : buildBill(fees.data ?? [], data.term),
      rules: {
        showPosition: flag(rules, "reportCard", "show-position"),
        showAttendance: flag(rules, "reportCard", "show-attendance"),
        showBill: flag(rules, "reportCard", "show-bill"),
        promotionMark: num(rules, "reportCard", "promotion-mark"),
        weights: { classWeight: CLASS_WEIGHT, examWeight: EXAM_WEIGHT },
      },
    };
  });
