import { attendanceBackdateReason } from "@/lib/academic-rules";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPeriodOpen, loadRules } from "@/lib/academic-calendar.server";
import { registerQuerySchema, saveAttendanceSchema } from "@/lib/attendance.schemas";

/**
 * Attendance is for administrators and for staff who carry class teacher
 * responsibility (assigned under Admissions) — nobody else.
 */
export const getAttendanceAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("role, email")
      .eq("id", context.userId)
      .maybeSingle();

    const role = profile?.role ?? "";
    if (role === "super_admin" || role === "school_manager") {
      return { allowed: true, isAdmin: true, classes: [] as string[] };
    }
    if (role !== "staff") return { allowed: false, isAdmin: false, classes: [] as string[] };

    const { data: rows } = await context.supabase
      .from("class_teachers")
      .select("class_name, teacher_id, teacher_email");
    const email = (profile?.email ?? "").toLowerCase();
    const classes = (rows ?? [])
      .filter(
        (r) =>
          r.teacher_id === context.userId || (r.teacher_email ?? "").toLowerCase() === email,
      )
      .map((r) => r.class_name);

    return { allowed: classes.length > 0, isAdmin: false, classes };
  });

/** Classes that actually have admitted students, plus their class teacher. */
export const getAttendanceClasses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: admissions, error }, { data: teachers }] = await Promise.all([
      context.supabase.from("admissions").select("class_admitted"),
      context.supabase.from("class_teachers").select("class_name, teacher_name"),
    ]);
    if (error) throw new Error(error.message);

    const counts = new Map<string, number>();
    for (const row of admissions ?? []) {
      const c = row.class_admitted;
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const byClass = new Map((teachers ?? []).map((t) => [t.class_name, t.teacher_name]));

    return [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([className, students]) => ({
        className,
        students,
        teacherName: byClass.get(className) ?? null,
      }));
  });

/** The register for one class on one date, with any attendance already recorded. */
export const getClassRegister = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => registerQuerySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: students, error } = await context.supabase
      .from("admissions")
      .select("id, admission_number, student_name, parent_name, parent_phone")
      .eq("class_admitted", data.className)
      .order("student_name");
    if (error) throw new Error(error.message);

    const ids = (students ?? []).map((s) => s.id);
    let existing: { admission_id: string; status: string; note: string }[] = [];
    if (ids.length > 0) {
      const { data: rows, error: attError } = await context.supabase
        .from("student_attendance")
        .select("admission_id, status, note")
        .eq("attendance_date", data.date)
        .in("admission_id", ids);
      if (attError) throw new Error(attError.message);
      existing = rows ?? [];
    }

    const byStudent = new Map(existing.map((r) => [r.admission_id, r]));
    return {
      alreadyRecorded: existing.length,
      students: (students ?? []).map((s) => ({
        ...s,
        status: byStudent.get(s.id)?.status ?? "Present",
        note: byStudent.get(s.id)?.note ?? "",
      })),
    };
  });

/** Save (or update) the register. One row per student per day. */
export const saveAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveAttendanceSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertPeriodOpen(context.supabase, { date: data.date });
    const backdate = attendanceBackdateReason(await loadRules(context.supabase), data.date);
    if (backdate) throw new Error(backdate);
    const { error } = await context.supabase.from("student_attendance").upsert(
      data.entries.map((e) => ({
        admission_id: e.admissionId,
        attendance_date: data.date,
        status: e.status,
        note: e.note ?? "",
      })),
      { onConflict: "admission_id,attendance_date" },
    );
    if (error) throw new Error(error.message);
    return { saved: data.entries.length };
  });

/** Recent registers, summarised by class and date. */
export const getAttendanceHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("student_attendance")
      .select("attendance_date, status, admissions(class_admitted)")
      .order("attendance_date", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);

    const groups = new Map<
      string,
      { date: string; className: string; present: number; absent: number; late: number; excused: number; total: number }
    >();
    for (const row of data ?? []) {
      const className =
        (row as { admissions?: { class_admitted?: string } | null }).admissions?.class_admitted ??
        "Unassigned";
      const key = `${row.attendance_date}|${className}`;
      const g =
        groups.get(key) ??
        {
          date: row.attendance_date,
          className,
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
          total: 0,
        };
      g.total += 1;
      if (row.status === "Present") g.present += 1;
      else if (row.status === "Absent") g.absent += 1;
      else if (row.status === "Late") g.late += 1;
      else if (row.status === "Excused") g.excused += 1;
      groups.set(key, g);
    }

    return [...groups.values()].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 60);
  });
