/* ------------------------------------------------------------------ *
 * Learner summaries shared by the parent dashboard, Termly Reports and
 * any module that shows a learner's attendance or scores. Pure and
 * browser-safe: periods come from the academic calendar, weights and
 * assessment categories from the academic rules — no local copies.
 * ------------------------------------------------------------------ */
import { periodForDate, type AcademicCalendar } from "@/lib/academic-calendar";
import { percentOf } from "@/lib/academic-rules";

/** "Present" and "Late" both count as attended (case-insensitive). */
export function isAttended(status: string | null | undefined) {
  const s = (status ?? "").trim().toLowerCase();
  return s === "present" || s === "late";
}

export interface AttendanceTally {
  period: string;
  start: string | null;
  end: string | null;
  present: number;
  late: number;
  absent: number;
  excused: number;
  total: number;
  /** Attended ÷ total, whole percent; null when nothing recorded. */
  rate: number | null;
}

const rate = (attended: number, total: number) => (total ? Math.round((attended / total) * 100) : null);

/** Attendance totals per academic period (newest first) plus an overall tally. */
export function summariseAttendance(
  rows: { attendance_date: string; status: string }[],
  cal: AcademicCalendar | null,
): { overall: AttendanceTally; periods: AttendanceTally[] } {
  const blank = (period: string, start: string | null, end: string | null): AttendanceTally => ({
    period, start, end, present: 0, late: 0, absent: 0, excused: 0, total: 0, rate: null,
  });
  const overall = blank("All periods", null, null);
  const byPeriod = new Map<string, AttendanceTally>();
  for (const r of rows) {
    const p = cal ? periodForDate(cal, r.attendance_date) : null;
    const key = p?.name ?? r.attendance_date.slice(0, 4);
    const t = byPeriod.get(key) ?? blank(p?.name ?? `Outside calendar (${key})`, p?.start ?? null, p?.end ?? null);
    for (const x of [t, overall]) {
      const s = r.status.trim().toLowerCase();
      if (s === "present") x.present++;
      else if (s === "late") x.late++;
      else if (s === "excused") x.excused++;
      else x.absent++;
      x.total++;
    }
    byPeriod.set(key, t);
  }
  const finish = (t: AttendanceTally) => ({ ...t, rate: rate(t.present + t.late, t.total) });
  return {
    overall: finish(overall),
    periods: [...byPeriod.values()].map(finish).sort((a, b) => (b.start ?? "").localeCompare(a.start ?? "")),
  };
}

export interface ScoreRow {
  term: string;
  subject: string;
  score: number;
  outOf: number;
}

/** Average percentage overall and per period/subject. */
export function summariseScores(rows: ScoreRow[]) {
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
  const terms = new Map<string, Map<string, number[]>>();
  for (const r of rows) {
    const bySub = terms.get(r.term) ?? new Map<string, number[]>();
    const list = bySub.get(r.subject) ?? [];
    list.push(percentOf(r.score, r.outOf));
    bySub.set(r.subject, list);
    terms.set(r.term, bySub);
  }
  return {
    average: avg(rows.map((r) => percentOf(r.score, r.outOf))),
    count: rows.length,
    terms: [...terms.entries()].map(([term, bySub]) => ({
      term,
      average: avg([...bySub.values()].flat()),
      subjects: [...bySub.entries()]
        .map(([subject, xs]) => ({ subject, average: avg(xs) ?? 0, count: xs.length }))
        .sort((a, b) => a.subject.localeCompare(b.subject)),
    })),
  };
}
