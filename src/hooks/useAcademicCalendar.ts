import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getAcademicCalendar } from "@/lib/config.functions";
import {
  MODE_LABEL,
  currentPeriod,
  defaultCalendar,
  withStatus,
  type AcademicCalendar,
} from "@/lib/academic-calendar";

let cache: { at: number; cal: AcademicCalendar } | null = null;
export function invalidateAcademicCalendar() {
  cache = null;
}

/** The configured academic calendar with live period statuses (60s cache). */
export function useAcademicCalendar() {
  const load = useServerFn(getAcademicCalendar);
  const [cal, setCal] = useState<AcademicCalendar>(cache?.cal ?? defaultCalendar());
  useEffect(() => {
    if (cache && Date.now() - cache.at < 60_000) return;
    let on = true;
    void load()
      .then((c) => {
        cache = { at: Date.now(), cal: c };
        if (on) setCal(c);
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, []);
  return {
    calendar: cal,
    labels: MODE_LABEL[cal.mode],
    periods: withStatus(cal),
    current: currentPeriod(cal),
  };
}
