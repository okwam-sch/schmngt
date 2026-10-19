/* ------------------------------------------------------------------ *
 * Academic calendar: the single source of truth for whether a school
 * runs terms or semesters, the date range of each period, and each
 * period's lifecycle (upcoming → active → closed → locked), which is
 * derived from today's date so it moves on automatically.
 *
 * Browser-safe; used by System Configuration, Attendance, Assessment,
 * Financial Management, Termly Reports and the server write guards.
 * ------------------------------------------------------------------ */
import { z } from "zod";

export const CALENDAR_FEATURE_KEY = "__academic_calendar";

export type CalendarMode = "term" | "semester";
export type PeriodStatus = "upcoming" | "active" | "closed" | "locked";

export const periodSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((p) => p.end >= p.start, { message: "End date must be after start date" });

export const calendarSchema = z
  .object({
    mode: z.enum(["term", "semester"]),
    academicYear: z.string().trim().min(4).max(20),
    periods: z.array(periodSchema).min(1).max(6),
    /** Days after a period ends during which late entries are still allowed. */
    graceDays: z.number().int().min(0).max(120),
    /** Once the grace window passes, block new/changed records for that period. */
    lockAfterGrace: z.boolean(),
    /** Optimistic-concurrency version; bumped by the server on every save. */
    version: z.number().int().min(0).default(0),
  })
  .refine(
    (c) => {
      const s = [...c.periods].sort((a, b) => a.start.localeCompare(b.start));
      return s.every((p, i) => i === 0 || p.start > (s[i - 1]?.end ?? ""));
    },
    { message: "Periods must not overlap" },
  )
  .refine((c) => new Set(c.periods.map((p) => p.name.toLowerCase())).size === c.periods.length, {
    message: "Period names must be unique",
  });

export type AcademicPeriod = z.infer<typeof periodSchema>;
export type AcademicCalendar = z.infer<typeof calendarSchema>;

export const MODE_LABEL: Record<CalendarMode, { singular: string; plural: string; billing: string }> = {
  term: { singular: "Term", plural: "Terms", billing: "termly" },
  semester: { singular: "Semester", plural: "Semesters", billing: "per semester" },
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Starting year of the academic year that contains `today`. */
function yearStart(today: Date, startMonth: number) {
  const y = today.getUTCFullYear();
  return today.getUTCMonth() + 1 >= startMonth ? y : y - 1;
}

/** Evenly split default periods for the given mode, starting at the academic year start month. */
export function defaultPeriods(mode: CalendarMode, startMonth = 9, today = new Date()): AcademicPeriod[] {
  const count = mode === "term" ? 3 : 2;
  const label = MODE_LABEL[mode].singular;
  const y = yearStart(today, startMonth);
  const months = Math.floor(12 / count);
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(Date.UTC(y, startMonth - 1 + i * months, 1));
    const end = new Date(Date.UTC(y, startMonth - 1 + (i + 1) * months, 0));
    return { name: `${label} ${i + 1}`, start: iso(start), end: iso(end) };
  });
}

export function defaultCalendar(startMonth = 9, today = new Date()): AcademicCalendar {
  const y = yearStart(today, startMonth);
  return {
    mode: "term",
    academicYear: `${y}/${y + 1}`,
    periods: defaultPeriods("term", startMonth, today),
    graceDays: 14,
    lockAfterGrace: true,
    version: 0,
  };
}

/** Read a stored calendar, falling back to the default when absent or malformed. */
export function parseCalendar(raw: unknown, startMonth = 9): AcademicCalendar {
  const r = calendarSchema.safeParse(raw);
  return r.success ? r.data : defaultCalendar(startMonth);
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

export function periodStatus(cal: AcademicCalendar, p: AcademicPeriod, today = iso(new Date())): PeriodStatus {
  if (today < p.start) return "upcoming";
  if (today <= p.end) return "active";
  if (cal.lockAfterGrace && today > addDays(p.end, cal.graceDays)) return "locked";
  return "closed";
}

export const STATUS_LABEL: Record<PeriodStatus, string> = {
  upcoming: "Upcoming",
  active: "Active",
  closed: "Closed (grace)",
  locked: "Locked",
};

export function withStatus(cal: AcademicCalendar, today = iso(new Date())) {
  return [...cal.periods]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((p) => ({ ...p, status: periodStatus(cal, p, today) }));
}

/** The active period; otherwise the next upcoming; otherwise the last one. */
export function currentPeriod(cal: AcademicCalendar, today = iso(new Date())) {
  const list = withStatus(cal, today);
  return (
    list.find((p) => p.status === "active") ??
    list.find((p) => p.status === "upcoming") ??
    list[list.length - 1]
  );
}

export function periodForDate(cal: AcademicCalendar, date: string) {
  return cal.periods.find((p) => date >= p.start && date <= p.end) ?? null;
}

export function findPeriod(cal: AcademicCalendar, name: string) {
  const n = name.trim().toLowerCase();
  return cal.periods.find((p) => p.name.toLowerCase() === n) ?? null;
}

/** The period that follows `name` in date order, or null when it is the last one. */
export function nextPeriod(cal: AcademicCalendar, name: string) {
  const sorted = [...cal.periods].sort((a, b) => a.start.localeCompare(b.start));
  const i = sorted.findIndex((p) => p.name.toLowerCase() === name.trim().toLowerCase());
  return i >= 0 ? sorted[i + 1] ?? null : null;
}

/**
 * Why a write against a period (by name) or a date is refused, or null if allowed.
 * Unknown period names are allowed so historic records keep working.
 */
export function writeBlockReason(
  cal: AcademicCalendar,
  target: { period?: string; date?: string; allowUpcoming?: boolean },
  today = iso(new Date()),
): string | null {
  const p = target.period ? findPeriod(cal, target.period) : target.date ? periodForDate(cal, target.date) : null;
  if (!p) return null;
  const s = periodStatus(cal, p, today);
  if (s === "locked") return `${p.name} is locked — its grace period has ended.`;
  if (s === "upcoming" && target.date && !target.allowUpcoming) return `${p.name} has not started yet.`;
  return null;
}

/** End date of the named period (or the current one) — default fee due date. */
export function periodEnd(cal: AcademicCalendar, name?: string) {
  return (name ? findPeriod(cal, name) : null)?.end ?? currentPeriod(cal)?.end ?? "";
}

/** Fee records store "<period> · <fee type>"; these build and read that label. */
export const PERIOD_SEP = " · ";
export function periodLabel(period: string, detail?: string) {
  return detail ? `${period}${PERIOD_SEP}${detail}` : period;
}
export function periodOfLabel(label: string) {
  return label.split(PERIOD_SEP)[0]?.trim() ?? label;
}

/* ---------------- financial coverage scopes (single lifecycle source) ---------------- */

export const COVERAGE_SCOPES = ["active-period", "period", "academic-year", "one-time", "all-time"] as const;
export type CoverageScope = (typeof COVERAGE_SCOPES)[number];

export function scopeLabel(scope: string, cal: AcademicCalendar) {
  const s = MODE_LABEL[cal.mode].singular.toLowerCase();
  switch (scope) {
    case "period": return `Specific ${s}`;
    case "academic-year": return "Entire academic year";
    case "one-time": return "One-time";
    case "all-time": return "All time (no expiry)";
    default: return `Active ${s} (rolls over automatically)`;
  }
}

/**
 * Resolve a financial item's coverage against the academic calendar.
 * Dates and lifecycle are never stored on the item — they always come from here.
 */
export function resolveCoverage(
  cal: AcademicCalendar,
  scope: string | undefined,
  period: string | undefined,
  today = iso(new Date()),
): { label: string; start: string | null; end: string | null; status: PeriodStatus | "always" } {
  const sorted = [...cal.periods].sort((a, b) => a.start.localeCompare(b.start));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  switch (scope) {
    case "period": {
      const p = period ? findPeriod(cal, period) : null;
      if (!p) return { label: "Choose a period", start: null, end: null, status: "upcoming" };
      return { label: p.name, start: p.start, end: p.end, status: periodStatus(cal, p, today) };
    }
    case "academic-year": {
      if (!first || !last) return { label: cal.academicYear, start: null, end: null, status: "always" };
      const span = { name: cal.academicYear, start: first.start, end: last.end };
      return { label: cal.academicYear, start: span.start, end: span.end, status: periodStatus(cal, span, today) };
    }
    case "one-time": {
      const p = currentPeriod(cal, today);
      return { label: `One-time (${p?.name ?? "now"})`, start: p?.start ?? null, end: p?.end ?? null, status: p ? periodStatus(cal, p, today) : "always" };
    }
    case "all-time":
      return { label: "All time", start: null, end: null, status: "always" };
    default: {
      const p = currentPeriod(cal, today);
      return p
        ? { label: p.name, start: p.start, end: p.end, status: periodStatus(cal, p, today) }
        : { label: "—", start: null, end: null, status: "always" };
    }
  }
}

/** Whether an item with this coverage applies to the named period (rolling scopes apply to all). */
export function coverageApplies(scope: string | undefined, period: string | undefined, target: string) {
  if (scope === "period") return !!period && period.toLowerCase() === target.toLowerCase();
  return true;
}
