import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPeriodOpen, loadRules, loadCalendar } from "@/lib/academic-calendar.server";
import { activeAssessmentTypes } from "@/lib/academic-rules";
import { assertTeaches, loadTeachingScope } from "@/lib/teaching.server";
import { assessmentIdSchema, assessmentInputSchema, assessmentPageSchema, assessmentSelectionSchema } from "@/lib/assessment.schemas";
import { assertStudentClass } from "@/lib/assessment";
import { readBranding } from "@/lib/branding.server";
import { resolveProvisionedSchool } from "@/lib/school.server";
import { subjectsForClass } from "@/lib/education-levels";

/** Selected metadata only, including actual subject teachers (never class teachers). */
export const getAssessmentContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => assessmentSelectionSchema.parse(d))
  .handler(async ({ data, context }) => {
    assertTeaches(await loadTeachingScope(context.supabase, context.userId), data.className, data.subject);
    const [branding, calendar, school, assignments] = await Promise.all([
      readBranding(context.supabase), loadCalendar(context.supabase), resolveProvisionedSchool(context.supabase),
      context.supabase.from("teaching_assignments").select("teacher_id").eq("class_name", data.className).eq("subject", data.subject),
    ]);
    if (assignments.error) throw new Error(assignments.error.message);
    const ids = [...new Set((assignments.data ?? []).map((r) => r.teacher_id))];
    const teachers = ids.length ? await context.supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [], error: null };
    if (teachers.error) throw new Error(teachers.error.message);
    return { school: school ? branding.name : null, academicYear: calendar?.academicYear ?? null, teachers: teachers.data ?? [], rules: await loadRules(context.supabase) };
  });

/** Students available for assessment entry — teachers see only classes they teach. */
export const getAssessmentStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => assessmentPageSchema.parse(d))
  .handler(async ({ data: selection, context }) => {
    const scope = await loadTeachingScope(context.supabase, context.userId);
    assertTeaches(scope, selection.className, selection.subject);
    let q = context.supabase
      .from("admissions")
      .select("id, admission_number, student_name, class_admitted", { count: "exact" })
      .eq("class_admitted", selection.className)
      .order("student_name").order("id")
      .range(selection.page * selection.pageSize, (selection.page + 1) * selection.pageSize - 1);
    if (selection.admissionId) q = q.eq("id", selection.admissionId);
    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: data ?? [], total: count ?? 0 };
  });

/** All assessment records with the student attached. */
export const listAssessments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => assessmentPageSchema.parse(d))
  .handler(async ({ data: selection, context }) => {
    const scope = await loadTeachingScope(context.supabase, context.userId);
    assertTeaches(scope, selection.className, selection.subject);
    let q = context.supabase
      .from("student_assessments")
      .select(
        "id, admission_id, class_name, term, subject, assessment_type, score, out_of, remark, created_at, admissions(student_name, admission_number)", { count: "exact" },
      )
      .eq("class_name", selection.className).eq("subject", selection.subject).eq("term", selection.term)
      .order("created_at", { ascending: false })
      .order("id")
      .range(selection.page * selection.pageSize, (selection.page + 1) * selection.pageSize - 1);
    if (selection.admissionId) q = q.eq("admission_id", selection.admissionId);
    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    const allowed = (r: { class_name: string; subject: string }) =>
      scope.isAdmin || scope.pairs.some((p) => p.class_name === r.class_name && p.subject === r.subject);

    return { total: count ?? 0, rows: (data ?? []).filter(allowed).map((row) => {
      const student = (row as { admissions?: { student_name?: string; admission_number?: string | null } | null })
        .admissions;
      return {
        id: row.id,
        admissionId: row.admission_id,
        studentName: student?.student_name ?? "Unknown student",
        admissionNumber: student?.admission_number ?? null,
        className: row.class_name,
        term: row.term,
        subject: row.subject,
        assessmentType: row.assessment_type,
        score: Number(row.score),
        outOf: Number(row.out_of),
        remark: row.remark,
        createdAt: row.created_at,
      };
    }) };
  });

/** Create or update one assessment record. */
export const saveAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => assessmentInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertPeriodOpen(context.supabase, { period: data.term });
    const scope = await loadTeachingScope(context.supabase, context.userId);
    assertTeaches(scope, data.className, data.subject);
    const { data: student, error: studentError } = await context.supabase.from("admissions").select("class_admitted").eq("id", data.admissionId).single();
    if (studentError || !student) throw new Error("Student not found or unavailable.");
    assertStudentClass(student.class_admitted, data.className);
    const school = await resolveProvisionedSchool(context.supabase);
    if (!school) throw new Error("Configure an active school before recording assessments.");
    const [classes, subjects] = await Promise.all([
      context.supabase.from("school_classes").select("name, level_code").eq("school_id", school.id).eq("active", true),
      context.supabase.from("subjects").select("name, level_code").eq("active", true).or(`school_id.eq.${school.id},school_id.is.null`),
    ]);
    if (classes.error || subjects.error) throw new Error("Could not validate class and subject configuration.");
    if (!subjectsForClass((subjects.data ?? []).map((s) => ({ name: s.name, levelCode: s.level_code })), (classes.data ?? []).map((c) => ({ name: c.name, levelCode: c.level_code })), data.className).includes(data.subject)) throw new Error("This subject is not configured for the selected class level.");
    const types = activeAssessmentTypes(await loadRules(context.supabase));
    if (!types.some((t) => t.toLowerCase() === data.assessmentType.toLowerCase())) {
      throw new Error(`"${data.assessmentType}" is not an active assessment type in Academic Configuration.`);
    }
    if (data.id) {
      const { data: existing, error } = await context.supabase
        .from("student_assessments").select("class_name, subject, term").eq("id", data.id).maybeSingle();
      if (error || !existing) throw new Error("Record not found.");
      assertTeaches(scope, existing.class_name, existing.subject);
      await assertPeriodOpen(context.supabase, { period: existing.term });
    }
    const row = {
      admission_id: data.admissionId,
      class_name: data.className,
      term: data.term,
      subject: data.subject,
      assessment_type: data.assessmentType,
      score: data.score,
      out_of: data.outOf,
      remark: data.remark,
      ...(data.createId && !data.id ? { id: data.createId } : {}),
    };

    if (data.id) {
      const { error } = await context.supabase
        .from("student_assessments")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id, updated: true };
    }

    const { data: inserted, error } = await context.supabase
      .from("student_assessments")
      .insert(row)
      .select("id")
      .single();
    if (error?.code === "23505" && data.createId) {
      const { data: existing, error: readError } = await context.supabase.from("student_assessments")
        .select("id, admission_id, class_name, term, subject, assessment_type, score, out_of, remark")
        .eq("id", data.createId).maybeSingle();
      if (!readError && existing && existing.admission_id === row.admission_id && existing.class_name === row.class_name && existing.term === row.term && existing.subject === row.subject && existing.assessment_type === row.assessment_type && Number(existing.score) === row.score && Number(existing.out_of) === row.out_of && existing.remark === row.remark) {
        return { id: existing.id, updated: false };
      }
      throw new Error("This save reference already exists with different data. Fetch records before retrying.");
    }
    if (error || !inserted) throw new Error(error?.message ?? "Could not save assessment.");
    return { id: inserted.id, updated: false };
  });

/** Remove one assessment record. */
export const deleteAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => assessmentIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const scope = await loadTeachingScope(context.supabase, context.userId);
    const { data: existing } = await context.supabase
      .from("student_assessments").select("class_name, subject, term").eq("id", data.id).maybeSingle();
    if (!existing) throw new Error("Record not found.");
    assertTeaches(scope, existing.class_name, existing.subject);
    await assertPeriodOpen(context.supabase, { period: existing.term });
    const { error } = await context.supabase
      .from("student_assessments")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { deleted: true };
  });
