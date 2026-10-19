import { createServerFn } from "@tanstack/react-start";
import { assertPeriodOpen, calendarPeriodEnd } from "@/lib/academic-calendar.server";
import { periodOfLabel } from "@/lib/academic-calendar";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, logAudit } from "@/lib/admin.server";
import { classLevelCode } from "@/lib/education-levels.server";
import { levelScopeError } from "@/lib/education-levels";
import {
  deleteSchema,
  expenseSchema,
  feeSchema,
  feeUpdateSchema,
  incomeSchema,
  payrollSchema,
} from "@/lib/finance.schemas";

/** Everything the Financial Management module needs, in one round trip. */
export const getFinancialOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabase } = context;

    const [income, expenses, payroll, fees, students, staff] = await Promise.all([
      supabase.from("finance_income").select("*").order("entry_date", { ascending: false }),
      supabase.from("finance_expenses").select("*").order("entry_date", { ascending: false }),
      supabase.from("finance_payroll").select("*").order("created_at", { ascending: false }),
      supabase
        .from("student_fees")
        .select("*, admissions(admission_number, student_name, class_admitted)")
        .order("created_at", { ascending: false }),
      supabase
        .from("admissions")
        .select("id, admission_number, student_name, class_admitted")
        .order("student_name"),
      supabase
        .from("profiles")
        .select("id, full_name, employee_id, position, department, salary")
        .in("role", ["staff", "school_manager"])
        .order("full_name"),
    ]);

    const failure =
      income.error ?? expenses.error ?? payroll.error ?? fees.error ?? students.error ?? staff.error;
    if (failure) throw new Error(failure.message);

    return {
      income: income.data ?? [],
      expenses: expenses.data ?? [],
      payroll: payroll.data ?? [],
      fees: fees.data ?? [],
      students: students.data ?? [],
      staff: staff.data ?? [],
    };
  });

export const addIncome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => incomeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertPeriodOpen(context.supabase, { date: data.entryDate });
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("finance_income").insert({
      entry_date: data.entryDate,
      description: data.description,
      category: data.category,
      amount: data.amount,
      status: data.status,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    await logAudit(context.supabase, context.userId, {
      action: "income_recorded",
      description: `Recorded income: ${data.description}`,
      details: { amount: data.amount, category: data.category },
    });
    return { ok: true };
  });

export const addExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => expenseSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertPeriodOpen(context.supabase, { date: data.entryDate });
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("finance_expenses").insert({
      entry_date: data.entryDate,
      description: data.description,
      category: data.category,
      amount: data.amount,
      status: data.status,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    await logAudit(context.supabase, context.userId, {
      action: "expense_recorded",
      description: `Recorded expense: ${data.description}`,
      details: { amount: data.amount, category: data.category },
    });
    return { ok: true };
  });

export const addPayrollEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => payrollSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (data.period) await assertPeriodOpen(context.supabase, { period: periodOfLabel(data.period) });
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("finance_payroll").insert({
      staff_id: data.staffId ?? null,
      employee_id: data.employeeId || null,
      employee_name: data.employeeName,
      position: data.position || null,
      basic_salary: data.basicSalary,
      allowances: data.allowances,
      deductions: data.deductions,
      period: data.period || null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    await logAudit(context.supabase, context.userId, {
      action: "payroll_entry_added",
      description: `Added payroll entry for ${data.employeeName}`,
      details: { basicSalary: data.basicSalary },
    });
    return { ok: true };
  });

/** Pulls every staff account that has no payroll entry yet into the payroll run. */
export const importStaffPayroll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabase } = context;

    const [{ data: staff, error: sErr }, { data: existing, error: eErr }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, employee_id, position, salary")
        .in("role", ["staff", "school_manager"]),
      supabase.from("finance_payroll").select("staff_id"),
    ]);
    if (sErr ?? eErr) throw new Error((sErr ?? eErr)!.message);

    const known = new Set((existing ?? []).map((r) => r.staff_id).filter(Boolean));
    const rows = (staff ?? [])
      .filter((s) => !known.has(s.id))
      .map((s) => ({
        staff_id: s.id,
        employee_id: s.employee_id,
        employee_name: s.full_name,
        position: s.position,
        basic_salary: Number(s.salary ?? 0),
        allowances: 0,
        deductions: 0,
        created_by: context.userId,
      }));
    if (rows.length === 0) return { added: 0 };

    const { error } = await supabase.from("finance_payroll").insert(rows);
    if (error) throw new Error(error.message);
    return { added: rows.length };
  });

/** Marks every pending payroll entry as processed. */
export const processPayroll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("finance_payroll")
      .update({ status: "processed" })
      .eq("status", "pending")
      .select("id, net_salary");
    if (error) throw new Error(error.message);

    const total = (data ?? []).reduce((sum, r) => sum + Number(r.net_salary ?? 0), 0);
    await logAudit(context.supabase, context.userId, {
      action: "payroll_processed",
      description: `Processed payroll for ${data?.length ?? 0} employees`,
      details: { total },
    });
    return { processed: data?.length ?? 0, total };
  });

export const addStudentFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => feeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertPeriodOpen(context.supabase, { period: periodOfLabel(data.term) });
    await assertAdmin(context.supabase, context.userId);
    if (data.feeCode) {
      const [{ data: item }, { data: learner }] = await Promise.all([
        context.supabase
          .from("finance_reference_items")
          .select("name, metadata")
          .eq("list_key", "fee-categories")
          .eq("code", data.feeCode)
          .limit(1)
          .maybeSingle(),
        context.supabase.from("admissions").select("class_admitted").eq("id", data.admissionId).maybeSingle(),
      ]);
      if (item) {
        const level = await classLevelCode(context.supabase, learner?.class_admitted);
        const err = levelScopeError(item.name, (item.metadata as Record<string, unknown> | null)?.["levels"], level);
        if (err) throw new Error(err);
      }
    }
    const { error } = await context.supabase.from("student_fees").insert({
      admission_id: data.admissionId,
      term: data.term,
      amount_due: data.amountDue,
      amount_paid: data.amountPaid,
      due_date: data.dueDate || (await calendarPeriodEnd(context.supabase, periodOfLabel(data.term))) || null,
      status: data.status,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateStudentFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => feeUpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("student_fees")
      .update({
        ...(data.amountPaid !== undefined ? { amount_paid: data.amountPaid } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteFinanceRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from(data.table).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
