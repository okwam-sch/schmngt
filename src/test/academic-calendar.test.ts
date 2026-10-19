import { describe, expect, it } from "vitest";
import {
  calendarSchema,
  coverageApplies,
  parseCalendar,
  periodStatus,
  resolveCoverage,
  writeBlockReason,
  type AcademicCalendar,
} from "@/lib/academic-calendar";
import { parseRules } from "@/lib/academic-rules";

const cal: AcademicCalendar = {
  mode: "term",
  academicYear: "2026/2027",
  periods: [
    { name: "Term 1", start: "2026-09-01", end: "2026-12-15" },
    { name: "Term 2", start: "2027-01-10", end: "2027-04-10" },
  ],
  graceDays: 14,
  lockAfterGrace: true,
  version: 3,
};
const t1 = cal.periods[0]!;

describe("academic calendar lifecycle", () => {
  it("moves a period through upcoming, active, grace and locked", () => {
    expect(periodStatus(cal, t1, "2026-08-31")).toBe("upcoming");
    expect(periodStatus(cal, t1, "2026-10-01")).toBe("active");
    expect(periodStatus(cal, t1, "2026-12-20")).toBe("closed");
    expect(periodStatus(cal, t1, "2027-01-05")).toBe("locked");
    expect(periodStatus({ ...cal, lockAfterGrace: false }, t1, "2027-01-05")).toBe("closed");
  });

  it("blocks writes only to locked or not-yet-started periods", () => {
    expect(writeBlockReason(cal, { period: "Term 1" }, "2027-01-05")).toMatch(/locked/);
    expect(writeBlockReason(cal, { period: "term 1" }, "2026-10-01")).toBeNull();
    expect(writeBlockReason(cal, { date: "2027-02-01" }, "2026-10-01")).toMatch(/not started/);
    expect(writeBlockReason(cal, { date: "2027-02-01", allowUpcoming: true }, "2026-10-01")).toBeNull();
    expect(writeBlockReason(cal, { period: "Old term" }, "2026-10-01")).toBeNull();
  });

  it("rejects overlapping periods and duplicate names", () => {
    const overlap = { ...cal, periods: [t1, { name: "Term 2", start: "2026-12-01", end: "2027-01-01" }] };
    expect(calendarSchema.safeParse(overlap).success).toBe(false);
    expect(calendarSchema.safeParse({ ...cal, periods: [t1, { ...t1, start: "2027-01-01", end: "2027-02-01" }] }).success).toBe(false);
  });
});

describe("financial coverage", () => {
  it("resolves every scope from the calendar using the given day", () => {
    expect(resolveCoverage(cal, "active-period", undefined, "2027-02-01").label).toBe("Term 2");
    expect(resolveCoverage(cal, "period", "Term 1", "2027-02-01").status).toBe("locked");
    expect(resolveCoverage(cal, "academic-year", undefined, "2026-10-01")).toMatchObject({ start: "2026-09-01", end: "2027-04-10", status: "active" });
    expect(resolveCoverage(cal, "all-time", undefined).status).toBe("always");
    expect(resolveCoverage(cal, "period", undefined).label).toBe("Choose a period");
  });

  it("applies period-scoped items only to their own period", () => {
    expect(coverageApplies("period", "Term 1", "term 1")).toBe(true);
    expect(coverageApplies("period", "Term 1", "Term 2")).toBe(false);
    expect(coverageApplies("academic-year", undefined, "Term 2")).toBe(true);
  });
});

describe("settings versioning", () => {
  it("treats saved data from before versioning as version 0", () => {
    const { version: _v, ...legacy } = cal;
    expect(parseCalendar(legacy).version).toBe(0);
    expect(parseCalendar(cal).version).toBe(3);
    expect(parseRules(undefined).version).toBe(0);
  });
});
