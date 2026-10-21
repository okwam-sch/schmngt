import { Pager, usePaged } from "@/components/portal/Paged";
import { PeriodDateInput, PeriodSelect } from "@/components/portal/PeriodFields";
import { useAcademicCalendar } from "@/hooks/useAcademicCalendar";
import { amountForLevel, appliesToLevel, levelOfClass } from "@/lib/education-levels";
import { useSchoolClasses } from "@/hooks/useSchoolClasses";
import { coverageApplies, periodEnd, periodLabel } from "@/lib/academic-calendar";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Download, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addExpense,
  addIncome,
  addPayrollEntry,
  addStudentFee,
  deleteFinanceRecord,
  getFinancialOverview,
  importStaffPayroll,
  processPayroll,
  updateStudentFee,
} from "@/lib/finance.functions";
import {
  EXPENSE_CATEGORIES,
  FEE_STATUSES,
  FEE_TYPES,
  INCOME_CATEGORIES,
  categoryLabel,
  today,
} from "@/lib/finance";
import { downloadRecordsCsv } from "@/lib/csv";
import { useFinanceConfig } from "@/hooks/useFinanceConfig";

type Overview = Awaited<ReturnType<typeof getFinancialOverview>>;

const num = (v: unknown) => Number(v ?? 0);

export function FinancialManagement() {
  const load = useServerFn(getFinancialOverview);
  const saveIncome = useServerFn(addIncome);
  const saveExpense = useServerFn(addExpense);
  const savePayroll = useServerFn(addPayrollEntry);
  const saveFee = useServerFn(addStudentFee);
  const patchFee = useServerFn(updateStudentFee);
  const removeRecord = useServerFn(deleteFinanceRecord);
  const runPayroll = useServerFn(processPayroll);
  const importStaff = useServerFn(importStaffPayroll);

  // Areas 01, 02, 06, 07: currency, fee types and categories come from
  // Financial Configuration, falling back to the platform defaults.
  const config = useFinanceConfig();
  const money = config.money;
  const incomeCategories = config.options("income-categories", INCOME_CATEGORIES);
  const expenseCategories = config.options("expense-categories", EXPENSE_CATEGORIES);
  const feeTypes = config.options("fee-categories", FEE_TYPES);

  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const next = await load();
    setData(next);
  };

  useEffect(() => {
    void load()
      .then(setData)
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Could not load financial records."),
      )
      .finally(() => setLoading(false));
  }, []);

  const run = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      toast.success(message);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const totals = useMemo(() => {
    const revenue =
      (data?.income ?? []).reduce((s, r) => s + num(r.amount), 0) +
      (data?.fees ?? []).reduce((s, r) => s + num(r.amount_paid), 0);
    const expenses =
      (data?.expenses ?? []).reduce((s, r) => s + num(r.amount), 0) +
      (data?.payroll ?? [])
        .filter((r) => r.status === "processed")
        .reduce((s, r) => s + num(r.net_salary), 0);
    const pending = (data?.fees ?? [])
      .filter((r) => r.status !== "paid")
      .reduce((s, r) => s + Math.max(num(r.amount_due) - num(r.amount_paid), 0), 0);
    const pendingCount = (data?.fees ?? []).filter((r) => r.status !== "paid").length;
    return { revenue, expenses, net: revenue - expenses, pending, pendingCount };
  }, [data]);

  if (loading) {
    return (
      <div className="surface flex items-center gap-3 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Loading financial records…
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total revenue" value={money(totals.revenue)} tone="positive" />
        <Stat label="Total expenses" value={money(totals.expenses)} tone="negative" />
        <Stat
          label="Net position"
          value={money(totals.net)}
          tone={totals.net >= 0 ? "positive" : "negative"}
        />
        <Stat
          label="Outstanding fees"
          value={money(totals.pending)}
          hint={`${totals.pendingCount} fee records unpaid`}
          tone="negative"
        />
      </div>

      <Tabs defaultValue="income" className="surface p-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="income">Income</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="fees">Student Fees</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        {/* ------------------------------ income ------------------------------ */}
        <TabsContent value="income" className="mt-6 space-y-4">
          <EntryDialog
            title="Add income"
            trigger="Add income"
            categories={incomeCategories}
            busy={busy}
            onSubmit={(v) =>
              run(
                () =>
                  saveIncome({
                    data: {
                      entryDate: v.date,
                      description: v.description,
                      category: v.category,
                      amount: v.amount,
                      status: "received",
                    },
                  }),
                "Income recorded.",
              )
            }
          />
          <RecordTable
            headers={["Date", "Description", "Category", `Amount`, "Status", ""]}
            empty="No income recorded yet."
            rows={data.income.map((r) => ({
              id: r.id,
              cells: [
                r.entry_date,
                r.description,
                categoryLabel(incomeCategories, r.category),
                money(r.amount),
                r.status,
              ],
            }))}
            onDelete={(id) =>
              run(
                () => removeRecord({ data: { id, table: "finance_income" } }),
                "Income record removed.",
              )
            }
          />
        </TabsContent>

        {/* ----------------------------- expenses ----------------------------- */}
        <TabsContent value="expenses" className="mt-6 space-y-4">
          <EntryDialog
            title="Add expense"
            trigger="Add expense"
            categories={expenseCategories}
            busy={busy}
            onSubmit={(v) =>
              run(
                () =>
                  saveExpense({
                    data: {
                      entryDate: v.date,
                      description: v.description,
                      category: v.category,
                      amount: v.amount,
                      status: "paid",
                    },
                  }),
                "Expense recorded.",
              )
            }
          />
          <RecordTable
            headers={["Date", "Description", "Category", "Amount", "Status", ""]}
            empty="No expenses recorded yet."
            rows={data.expenses.map((r) => ({
              id: r.id,
              cells: [
                r.entry_date,
                r.description,
                categoryLabel(expenseCategories, r.category),
                money(r.amount),
                r.status,
              ],
            }))}
            onDelete={(id) =>
              run(
                () => removeRecord({ data: { id, table: "finance_expenses" } }),
                "Expense record removed.",
              )
            }
          />
        </TabsContent>

        {/* ------------------------------- fees ------------------------------- */}
        <TabsContent value="fees" className="mt-6 space-y-4">
          <FeeDialog
            feeTypes={feeTypes}
            feeItems={config.items.filter((i) => i.list_key === "fee-categories" && i.active)}
            students={data.students}
            busy={busy}
            onSubmit={(v) =>
              run(
                () =>
                  saveFee({
                    data: {
                      admissionId: v.admissionId,
                      term: v.term,
                      feeCode: v.feeCode,
                      amountDue: v.amountDue,
                      amountPaid: 0,
                      dueDate: v.dueDate || null,
                      status: v.status,
                    },
                  }),
                "Fee added.",
              )
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  {["Student", "Class", "Term / fee type", "Due", "Paid", "Due date", "Status", ""].map(
                    (h) => (
                      <th key={h} className="px-3 py-2 font-semibold">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {data.fees.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                      No fee records yet.
                    </td>
                  </tr>
                ) : (
                  data.fees.map((f) => {
                    const student = f.admissions as
                      | { admission_number: string | null; student_name: string; class_admitted: string }
                      | null;
                    return (
                      <tr key={f.id} className="border-b border-border/60">
                        <td className="px-3 py-2">
                          <span className="font-medium">{student?.student_name ?? "—"}</span>
                          <span className="block text-xs text-muted-foreground">
                            {student?.admission_number ?? ""}
                          </span>
                        </td>
                        <td className="px-3 py-2">{student?.class_admitted ?? "—"}</td>
                        <td className="px-3 py-2">{f.term}</td>
                        <td className="px-3 py-2">{money(f.amount_due)}</td>
                        <td className="px-3 py-2">{money(f.amount_paid)}</td>
                        <td className="px-3 py-2">{f.due_date ?? "—"}</td>
                        <td className="px-3 py-2">
                          <Select
                            value={f.status}
                            onValueChange={(status) =>
                              void run(
                                () =>
                                  patchFee({
                                    data: {
                                      id: f.id,
                                      status: status as "pending" | "paid" | "overdue",
                                      ...(status === "paid"
                                        ? { amountPaid: num(f.amount_due) }
                                        : {}),
                                    },
                                  }),
                                "Fee updated.",
                              )
                            }
                          >
                            <SelectTrigger className="h-8 w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FEE_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete fee record"
                            onClick={() =>
                              void run(
                                () => removeRecord({ data: { id: f.id, table: "student_fees" } }),
                                "Fee record removed.",
                              )
                            }
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ------------------------------ payroll ------------------------------ */}
        <TabsContent value="payroll" className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            <PayrollDialog staff={data.staff} busy={busy} onSubmit={(v) =>
              run(
                () =>
                  savePayroll({
                    data: {
                      staffId: v.staffId,
                      employeeId: v.employeeId,
                      employeeName: v.employeeName,
                      position: v.position,
                      basicSalary: v.basicSalary,
                      allowances: v.allowances,
                      deductions: v.deductions,
                      period: v.period,
                    },
                  }),
                "Payroll entry added.",
              )
            } />
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const res = await importStaff();
                  toast.info(`${res.added} staff added to payroll.`);
                }, "Payroll updated from staff records.")
              }
            >
              Pull from staff records
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const res = await runPayroll();
                  toast.info(`${res.processed} employees paid, ${money(res.total)} total.`);
                }, "Payroll processed.")
              }
            >
              <Wallet className="size-4" aria-hidden /> Process payroll
            </Button>
          </div>
          <RecordTable
            headers={[
              "Employee ID",
              "Name",
              "Position",
              "Basic",
              "Allowances",
              "Deductions",
              "Net",
              "Status",
              "",
            ]}
            empty="No payroll entries yet."
            rows={data.payroll.map((p) => ({
              id: p.id,
              cells: [
                p.employee_id ?? "—",
                p.employee_name,
                p.position ?? "—",
                money(p.basic_salary),
                money(p.allowances),
                money(p.deductions),
                money(p.net_salary),
                p.status,
              ],
            }))}
            onDelete={(id) =>
              run(
                () => removeRecord({ data: { id, table: "finance_payroll" } }),
                "Payroll entry removed.",
              )
            }
          />
        </TabsContent>

        {/* ------------------------------ reports ------------------------------ */}
        <TabsContent value="reports" className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border p-4">
              <h3 className="font-semibold">Income vs expenses</h3>
              <Bar label="Income" value={totals.revenue} max={Math.max(totals.revenue, totals.expenses, 1)} tone="positive" money={money} />
              <Bar label="Expenses" value={totals.expenses} max={Math.max(totals.revenue, totals.expenses, 1)} tone="negative" money={money} />
            </div>
            <div className="rounded-lg border border-border p-4">
              <h3 className="mb-3 font-semibold">Monthly trend</h3>
              <MonthlyTrend income={data.income} expenses={data.expenses} money={money} />
            </div>
          </div>
          <div className="rounded-lg border border-border p-4">
            <h3 className="mb-3 font-semibold">Export reports</h3>
            <div className="flex flex-wrap gap-2">
              <ExportButton
                label="Income report"
                onClick={() => downloadCsv("income-report.csv", data.income as never)}
              />
              <ExportButton
                label="Expense report"
                onClick={() => downloadCsv("expense-report.csv", data.expenses as never)}
              />
              <ExportButton
                label="Payroll report"
                onClick={() => downloadCsv("payroll-report.csv", data.payroll as never)}
              />
              <ExportButton
                label="Fee report"
                onClick={() =>
                  downloadCsv(
                    "fee-report.csv",
                    data.fees.map((f) => {
                      const s = f.admissions as { student_name?: string; admission_number?: string } | null;
                      return {
                        admission_number: s?.admission_number ?? "",
                        student_name: s?.student_name ?? "",
                        term: f.term,
                        amount_due: f.amount_due,
                        amount_paid: f.amount_paid,
                        due_date: f.due_date ?? "",
                        status: f.status,
                      };
                    }),
                  )
                }
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------ small pieces ------------------------------ */

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: "positive" | "negative";
}) {
  return (
    <div className="surface p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-2 text-2xl font-bold ${tone === "positive" ? "text-success" : "text-destructive"}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Bar({
  label,
  value,
  max,
  tone,
  money,
}: {
  label: string;
  value: number;
  max: number;
  tone: "positive" | "negative";
  money: (n: number) => string;
}) {
  return (
    <div className="mt-3">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">{money(value)}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-muted">
        <div
          className={`h-2 rounded-full ${tone === "positive" ? "bg-success" : "bg-destructive"}`}
          style={{ width: `${Math.min((value / max) * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}

function MonthlyTrend({
  income,
  expenses,
  money,
}: {
  income: { entry_date: string; amount: number | string }[];
  expenses: { entry_date: string; amount: number | string }[];
  money: (n: number) => string;
}) {
  const months = useMemo(() => {
    const map = new Map<string, { income: number; expenses: number }>();
    const add = (key: "income" | "expenses", rows: typeof income) => {
      for (const r of rows) {
        const m = String(r.entry_date).slice(0, 7);
        const cur = map.get(m) ?? { income: 0, expenses: 0 };
        cur[key] += num(r.amount);
        map.set(m, cur);
      }
    };
    add("income", income);
    add("expenses", expenses);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6);
  }, [income, expenses]);

  if (months.length === 0) {
    return <p className="text-sm text-muted-foreground">No dated records yet.</p>;
  }

  const max = Math.max(...months.map(([, v]) => Math.max(v.income, v.expenses)), 1);

  return (
    <div className="space-y-3">
      {months.map(([month, v]) => (
        <div key={month}>
          <p className="text-xs font-medium text-muted-foreground">{month}</p>
          <Bar label="In" value={v.income} max={max} tone="positive" money={money} />
          <Bar label="Out" value={v.expenses} max={max} tone="negative" money={money} />
        </div>
      ))}
    </div>
  );
}

function ExportButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="outline" onClick={onClick}>
      <Download className="size-4" aria-hidden /> {label}
    </Button>
  );
}

function RecordTable({
  headers,
  rows,
  empty,
  onDelete,
}: {
  headers: string[];
  rows: { id: string; cells: (string | number)[] }[];
  empty: string;
  onDelete: (id: string) => void | Promise<unknown>;
}) {
  const page = usePaged(rows, 25);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            {headers.map((h, i) => (
              <th key={`${h}-${i}`} className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-3 py-6 text-center text-muted-foreground">
                {empty}
              </td>
            </tr>
          ) : (
            page.items.map((r) => (
              <tr key={r.id} className="border-b border-border/60">
                {r.cells.map((c, i) => (
                  <td key={i} className="px-3 py-2">
                    {c}
                  </td>
                ))}
                <td className="px-3 py-2 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete record"
                    onClick={() => void onDelete(r.id)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <Pager {...page} />
    </div>
  );
}

function EntryDialog({
  title,
  trigger,
  categories,
  busy,
  onSubmit,
}: {
  title: string;
  trigger: string;
  categories: readonly { value: string; label: string }[];
  busy: boolean;
  onSubmit: (v: {
    date: string;
    description: string;
    category: string;
    amount: number;
  }) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(categories[0]!.value);
  const [amount, setAmount] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" aria-hidden /> {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Date">
            <PeriodDateInput value={date} onChange={setDate} />
          </Field>
          <Field label="Description">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this for?"
            />
          </Field>
          <Field label="Category">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Amount">
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button
            disabled={busy}
            onClick={async () => {
              const ok = await onSubmit({
                date,
                description: description.trim(),
                category,
                amount: Number(amount || 0),
              });
              if (ok) {
                setOpen(false);
                setDescription("");
                setAmount("");
              }
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeeDialog({
  students,
  feeTypes,
  feeItems,
  busy,
  onSubmit,
}: {
  feeTypes: { value: string; label: string }[];
  feeItems: { code: string; name: string; metadata: Record<string, unknown> | null }[];
  students: { id: string; student_name: string; admission_number: string | null; class_admitted: string }[];
  busy: boolean;
  onSubmit: (v: {
    admissionId: string;
    term: string;
    feeCode: string | null;
    amountDue: number;
    dueDate: string;
    status: "pending" | "paid" | "overdue";
  }) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [admissionId, setAdmissionId] = useState("");
  const cal = useAcademicCalendar();
  const [period, setPeriod] = useState("");
  const [term, setTerm] = useState<string>(feeTypes[0]?.label ?? "");
  const [amountDue, setAmountDue] = useState("");
  const activePeriod = period || cal.current?.name || "";
  const { classes } = useSchoolClasses();
  const student = students.find((s) => s.id === admissionId);
  const level = levelOfClass(classes, student?.class_admitted);
  // Fee categories for this term/semester and the learner's education level.
  const availableTypes = feeTypes.filter((t) => {
    const item = feeItems.find((i) => i.code === t.value);
    return (
      !item ||
      (coverageApplies(item.metadata?.["scope"] as string, item.metadata?.["period"] as string, activePeriod) &&
        appliesToLevel(item.metadata?.["levels"], level))
    );
  });
  const pickType = (label: string, lvl = level) => {
    setTerm(label);
    const item = feeItems.find((i) => i.name === label);
    const amt = amountForLevel(item?.metadata, lvl);
    if (amt > 0) setAmountDue(String(amt));
  };
  const [dueDate, setDueDate] = useState("");
  // Due date follows the selected term/semester end unless the user changes it.
  const effectiveDue = dueDate || periodEnd(cal.calendar, period || undefined);
  const [status, setStatus] = useState<"pending" | "paid" | "overdue">("pending");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" aria-hidden /> Add fee
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add student fee</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Student">
            <Select
              value={admissionId}
              onValueChange={(id) => {
                setAdmissionId(id);
                const lvl = levelOfClass(classes, students.find((s) => s.id === id)?.class_admitted);
                const item = feeItems.find((i) => i.name === term);
                if (item && !appliesToLevel(item.metadata?.["levels"], lvl)) {
                  setTerm("");
                  setAmountDue("");
                } else if (term) pickType(term, lvl);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a student" />
              </SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.student_name} {s.admission_number ? `(${s.admission_number})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={cal.labels.singular}>
            <PeriodSelect
              value={period}
              onChange={(v) => {
                setPeriod(v);
                setDueDate("");
              }}
            />
          </Field>
          <Field label="Fee type">
            <Select value={term} onValueChange={pickType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableTypes.map((t) => (
                  <SelectItem key={t.value} value={t.label}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Amount">
            <Input
              type="number"
              step="0.01"
              value={amountDue}
              onChange={(e) => setAmountDue(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="Due date">
            <PeriodDateInput value={effectiveDue} onChange={setDueDate} />
          </Field>
          <Field label="Status">
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as "pending" | "paid" | "overdue")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button
            disabled={busy || !admissionId || !term}
            onClick={async () => {
              const ok = await onSubmit({
                admissionId,
                term: periodLabel(period || cal.current?.name || "", term),
                feeCode: feeItems.find((i) => i.name === term)?.code ?? null,
                amountDue: Number(amountDue || 0),
                dueDate: effectiveDue,
                status,
              });
              if (ok) {
                setOpen(false);
                setAmountDue("");
              }
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayrollDialog({
  staff,
  busy,
  onSubmit,
}: {
  staff: {
    id: string;
    full_name: string;
    employee_id: string | null;
    position: string | null;
    salary: number | null;
  }[];
  busy: boolean;
  onSubmit: (v: {
    staffId: string | null;
    employeeId: string;
    employeeName: string;
    position: string;
    basicSalary: number;
    allowances: number;
    deductions: number;
    period: string;
  }) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [staffId, setStaffId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [position, setPosition] = useState("");
  const [basicSalary, setBasicSalary] = useState("");
  const [allowances, setAllowances] = useState("0");
  const [deductions, setDeductions] = useState("0");
  const payCal = useAcademicCalendar();
  const [payTerm, setPayTerm] = useState("");
  const [period, setPeriod] = useState(today().slice(0, 7));

  const pick = (id: string) => {
    setStaffId(id);
    const s = staff.find((x) => x.id === id);
    if (s) {
      setEmployeeId(s.employee_id ?? "");
      setEmployeeName(s.full_name);
      setPosition(s.position ?? "");
      setBasicSalary(String(s.salary ?? ""));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" aria-hidden /> Add payroll entry
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add payroll entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Staff member">
            <Select value={staffId} onValueChange={pick}>
              <SelectTrigger>
                <SelectValue placeholder="Select a staff member" />
              </SelectTrigger>
              <SelectContent>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name} {s.employee_id ? `(${s.employee_id})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Employee ID">
              <Input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
            </Field>
            <Field label="Name">
              <Input value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} />
            </Field>
            <Field label="Position">
              <Input value={position} onChange={(e) => setPosition(e.target.value)} />
            </Field>
            <Field label="Pay period">
              <div className="grid grid-cols-2 gap-2">
                <PeriodSelect value={payTerm} onChange={setPayTerm} />
                <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
              </div>
            </Field>
            <Field label="Basic salary">
              <Input
                type="number"
                step="0.01"
                value={basicSalary}
                onChange={(e) => setBasicSalary(e.target.value)}
              />
            </Field>
            <Field label="Allowances">
              <Input
                type="number"
                step="0.01"
                value={allowances}
                onChange={(e) => setAllowances(e.target.value)}
              />
            </Field>
            <Field label="Deductions">
              <Input
                type="number"
                step="0.01"
                value={deductions}
                onChange={(e) => setDeductions(e.target.value)}
              />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={busy || employeeName.trim().length < 2}
            onClick={async () => {
              const ok = await onSubmit({
                staffId: staffId || null,
                employeeId,
                employeeName: employeeName.trim(),
                position,
                basicSalary: Number(basicSalary || 0),
                allowances: Number(allowances || 0),
                deductions: Number(deductions || 0),
                period: periodLabel(payTerm || payCal.current?.name || "", period),
              });
              if (ok) setOpen(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
