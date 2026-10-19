/* ------------------------------------------------------------------ *
 * Archives — registry of historical record sources and retention logic.
 *
 * Nothing is copied into a separate archive table: every module keeps its
 * own records, and a record's archive state is derived from the academic
 * calendar (the only lifecycle source) and the retention policies in
 * Reporting & Records Configuration → Archive & Retention. Adding a source is a
 * registry entry here — no new page, no migration.
 *
 * Browser-safe.
 * ------------------------------------------------------------------ */
import {
  periodForDate,
  periodStatus,
  type AcademicCalendar,
} from "@/lib/academic-calendar";

export interface ArchiveColumn {
  key: string;
  label: string;
  /** Path into the row, dot-separated for joined objects. */
  path: string;
  money?: boolean;
}

export interface ArchiveSource {
  key: string;
  label: string;
  module: string;
  table: string;
  /** Column used to place the record in the academic calendar. */
  dateColumn: string;
  select: string;
  columns: ArchiveColumn[];
  /** Platform default when no retention policy names this source. */
  defaultRetentionYears: number;
}

export const ARCHIVE_SOURCES: ArchiveSource[] = [
  {
    key: "attendance",
    label: "Attendance registers",
    module: "Attendance",
    table: "student_attendance",
    dateColumn: "attendance_date",
    select: "id, attendance_date, status, note, admissions(student_name, admission_number, class_admitted)",
    columns: [
      { key: "student", label: "Student", path: "admissions.student_name" },
      { key: "class", label: "Class", path: "admissions.class_admitted" },
      { key: "status", label: "Status", path: "status" },
      { key: "note", label: "Note", path: "note" },
    ],
    defaultRetentionYears: 7,
  },
  {
    key: "assessments",
    label: "Assessment scores",
    module: "Assessment",
    table: "student_assessments",
    dateColumn: "created_at",
    select: "id, created_at, term, subject, assessment_type, score, out_of, admissions(student_name, class_admitted)",
    columns: [
      { key: "student", label: "Student", path: "admissions.student_name" },
      { key: "term", label: "Term", path: "term" },
      { key: "subject", label: "Subject", path: "subject" },
      { key: "type", label: "Type", path: "assessment_type" },
      { key: "score", label: "Score", path: "score" },
    ],
    defaultRetentionYears: 10,
  },
  {
    key: "fees",
    label: "Student fees",
    module: "Financial Management",
    table: "student_fees",
    dateColumn: "created_at",
    select: "id, created_at, term, amount_due, amount_paid, status, admissions(student_name)",
    columns: [
      { key: "student", label: "Student", path: "admissions.student_name" },
      { key: "term", label: "Term / fee", path: "term" },
      { key: "due", label: "Due", path: "amount_due", money: true },
      { key: "paid", label: "Paid", path: "amount_paid", money: true },
      { key: "status", label: "Status", path: "status" },
    ],
    defaultRetentionYears: 7,
  },
  {
    key: "income",
    label: "Income",
    module: "Financial Management",
    table: "finance_income",
    dateColumn: "entry_date",
    select: "id, entry_date, description, category, amount, status",
    columns: [
      { key: "description", label: "Description", path: "description" },
      { key: "category", label: "Category", path: "category" },
      { key: "amount", label: "Amount", path: "amount", money: true },
      { key: "status", label: "Status", path: "status" },
    ],
    defaultRetentionYears: 7,
  },
  {
    key: "expenses",
    label: "Expenses",
    module: "Financial Management",
    table: "finance_expenses",
    dateColumn: "entry_date",
    select: "id, entry_date, description, category, amount, status",
    columns: [
      { key: "description", label: "Description", path: "description" },
      { key: "category", label: "Category", path: "category" },
      { key: "amount", label: "Amount", path: "amount", money: true },
      { key: "status", label: "Status", path: "status" },
    ],
    defaultRetentionYears: 7,
  },
  {
    key: "payroll",
    label: "Payroll",
    module: "Financial Management",
    table: "finance_payroll",
    dateColumn: "created_at",
    select: "id, created_at, employee_name, period, basic_salary, net_salary, status",
    columns: [
      { key: "employee", label: "Employee", path: "employee_name" },
      { key: "period", label: "Period", path: "period" },
      { key: "net", label: "Net", path: "net_salary", money: true },
      { key: "status", label: "Status", path: "status" },
    ],
    defaultRetentionYears: 7,
  },
  {
    key: "schedules",
    label: "Staff schedules",
    module: "Staff Management",
    table: "staff_schedules",
    dateColumn: "schedule_date",
    select: "id, schedule_date, start_time, end_time, schedule_type",
    columns: [
      { key: "type", label: "Type", path: "schedule_type" },
      { key: "start", label: "Start", path: "start_time" },
      { key: "end", label: "End", path: "end_time" },
    ],
    defaultRetentionYears: 3,
  },
  {
    key: "offers",
    label: "Offer letters",
    module: "Staff Management",
    table: "offer_letters",
    dateColumn: "created_at",
    select: "id, created_at, candidate_name, position, start_date, status",
    columns: [
      { key: "candidate", label: "Candidate", path: "candidate_name" },
      { key: "position", label: "Position", path: "position" },
      { key: "start", label: "Start date", path: "start_date" },
      { key: "status", label: "Status", path: "status" },
    ],
    defaultRetentionYears: 6,
  },
  {
    key: "audit",
    label: "Audit log",
    module: "Administration",
    table: "audit_logs",
    dateColumn: "created_at",
    select: "id, created_at, action, description",
    columns: [
      { key: "action", label: "Action", path: "action" },
      { key: "description", label: "Description", path: "description" },
    ],
    defaultRetentionYears: 10,
  },
];

export const getArchiveSource = (key: string) => ARCHIVE_SOURCES.find((s) => s.key === key);

export type ArchiveState = "current" | "archived" | "disposal-due";

export const ARCHIVE_STATE_LABEL: Record<ArchiveState, string> = {
  current: "Current",
  archived: "Archived",
  "disposal-due": "Past retention",
};

/** Academic-year label ("2025/2026") for a date, using the calendar's year start. */
export function academicYearOf(date: string, cal: AcademicCalendar) {
  const startMonth = Number(cal.periods.map((p) => p.start).sort()[0]?.slice(5, 7) ?? 9) || 9;
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const start = m >= startMonth ? y : y - 1;
  return `${start}/${start + 1}`;
}

export interface RetentionPolicy {
  years: number;
  /** Name of the configured policy, or null for the platform default. */
  policy: string | null;
}

/**
 * Retention for a source. A policy applies when its "When" text names the
 * source key, label or module; its "Then" text gives the years ("retain 7 years").
 */
export function retentionFor(
  source: ArchiveSource,
  rules: { name: string; active: boolean; conditions: Record<string, unknown>; actions: Record<string, unknown> }[],
): RetentionPolicy {
  for (const r of rules) {
    if (!r.active) continue;
    const when = String(r.conditions?.["when"] ?? "").toLowerCase();
    const names = [source.key, source.label, source.module].map((n) => n.toLowerCase());
    if (!when || !(names.some((n) => when.includes(n)) || when.includes("all"))) continue;
    const years = Number(String(r.actions?.["then"] ?? "").match(/\d+/)?.[0]);
    if (years > 0) return { years, policy: r.name };
  }
  return { years: source.defaultRetentionYears, policy: null };
}

/**
 * A record is current while it sits in the configured academic year and its
 * term/semester is not locked; archived once its period locks or the year has
 * passed; past retention once older than the retention window.
 */
export function archiveStateOf(
  date: string,
  cal: AcademicCalendar,
  retentionYears: number,
  today = new Date().toISOString().slice(0, 10),
): ArchiveState {
  const d = date.slice(0, 10);
  const cutoff = `${Number(today.slice(0, 4)) - retentionYears}${today.slice(4)}`;
  if (d < cutoff) return "disposal-due";
  const p = periodForDate(cal, d);
  if (p) return periodStatus(cal, p, today) === "locked" ? "archived" : "current";
  const yearStart = [...cal.periods].map((x) => x.start).sort()[0] ?? today;
  return d < yearStart ? "archived" : "current";
}

export function valueAt(row: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), row);
}
