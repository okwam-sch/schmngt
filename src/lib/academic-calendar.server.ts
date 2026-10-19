import { RULES_FEATURE_KEY, parseRules } from "@/lib/academic-rules";
import { CALENDAR_FEATURE_KEY, parseCalendar, periodEnd, writeBlockReason } from "@/lib/academic-calendar";

/** Server-side lifecycle guard: refuses writes into locked (or not-yet-started) periods. */
/** The school's configured calendar on the server, or null when none is saved yet. */
export async function loadCalendar(supabase: any) {
  const { data } = await supabase
    .from("tenant_settings")
    .select("features, academic_year_start_month")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const raw = data?.features?.[CALENDAR_FEATURE_KEY];
  return raw ? parseCalendar(raw, data?.academic_year_start_month ?? 9) : null;
}

export async function calendarPeriodEnd(supabase: any, period?: string) {
  const cal = await loadCalendar(supabase);
  return cal ? periodEnd(cal, period) : "";
}

export async function assertPeriodOpen(
  supabase: any,
  target: { period?: string; date?: string; allowUpcoming?: boolean },
) {
  const cal = await loadCalendar(supabase);
  if (!cal) return; // no calendar configured yet: nothing to enforce
  const reason = writeBlockReason(cal, target);
  if (reason) throw new Error(reason);
}

/** The school's academic rules on the server (defaults when none saved). */
export async function loadRules(supabase: any) {
  const { data } = await supabase
    .from("tenant_settings")
    .select("features")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return parseRules(data?.features?.[RULES_FEATURE_KEY]);
}
