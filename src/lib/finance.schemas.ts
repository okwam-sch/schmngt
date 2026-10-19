import { z } from "zod";

const amount = z.number().min(0).max(1_000_000_000);
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const date = z.string().trim().min(8).max(20);

export const incomeSchema = z.object({
  entryDate: date,
  description: text(2, 300),
  category: text(2, 40),
  amount,
  status: z.enum(["received", "pending"]).default("received"),
});

export const expenseSchema = z.object({
  entryDate: date,
  description: text(2, 300),
  category: text(2, 40),
  amount,
  status: z.enum(["paid", "pending"]).default("paid"),
});

export const payrollSchema = z.object({
  staffId: z.string().uuid().nullable().optional(),
  employeeId: z.string().trim().max(60).optional().default(""),
  employeeName: text(2, 160),
  position: z.string().trim().max(120).optional().default(""),
  basicSalary: amount,
  allowances: amount,
  deductions: amount,
  period: z.string().trim().max(40).optional().default(""),
});

export const feeSchema = z.object({
  admissionId: z.string().uuid(),
  term: text(2, 60),
  /** Configured fee category code; checked against the learner's education level. */
  feeCode: z.string().trim().max(60).nullable().optional(),
  amountDue: amount,
  amountPaid: amount.default(0),
  dueDate: date.nullable().optional(),
  status: z.enum(["pending", "paid", "overdue"]).default("pending"),
});

export const feeUpdateSchema = z.object({
  id: z.string().uuid(),
  amountPaid: amount.optional(),
  status: z.enum(["pending", "paid", "overdue"]).optional(),
});

export const idSchema = z.object({ id: z.string().uuid() });
export const deleteSchema = z.object({
  id: z.string().uuid(),
  table: z.enum(["finance_income", "finance_expenses", "finance_payroll", "student_fees"]),
});

export type IncomeInput = z.infer<typeof incomeSchema>;
export type ExpenseInput = z.infer<typeof expenseSchema>;
export type PayrollInput = z.infer<typeof payrollSchema>;
export type FeeInput = z.infer<typeof feeSchema>;
