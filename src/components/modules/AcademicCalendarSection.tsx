import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Save, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { getSchoolCalendar, saveAcademicCalendar } from "@/lib/config.functions";
import { invalidateAcademicCalendar } from "@/hooks/useAcademicCalendar";
import {
  MODE_LABEL,
  STATUS_LABEL,
  calendarSchema,
  defaultPeriods,
  periodStatus,
  type AcademicCalendar,
  type CalendarMode,
} from "@/lib/academic-calendar";

const STATUS_VARIANT = { upcoming: "outline", active: "default", closed: "secondary", locked: "destructive" } as const;

export function AcademicCalendarSection({ schoolId, startMonth }: { schoolId: string; startMonth: number }) {
  const load = useServerFn(getSchoolCalendar);
  const save = useServerFn(saveAcademicCalendar);
  const [cal, setCal] = useState<AcademicCalendar | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    setCal(null);
    void load({ data: { schoolId } }).then(setCal).catch((e) => toast.error(e.message));
  }, [schoolId]);

  if (!schoolId) return <p className="text-sm text-muted-foreground">Select a school first.</p>;
  if (!cal) return <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />;

  const label = MODE_LABEL[cal.mode];
  const setPeriod = (i: number, k: "name" | "start" | "end", v: string) =>
    setCal({ ...cal, periods: cal.periods.map((p, j) => (j === i ? { ...p, [k]: v } : p)) });

  const onSave = async () => {
    const parsed = calendarSchema.safeParse(cal);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the dates");
      return;
    }
    setBusy(true);
    try {
      const r = await save({ data: { schoolId, calendar: parsed.data } });
      setCal({ ...parsed.data, version: r.version });
      invalidateAcademicCalendar();
      toast.success("Academic calendar saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Academic calendar</h3>
        <p className="text-sm text-muted-foreground">
          Choose terms or semesters and their dates. Attendance, Assessment, billing and report cards all follow this
          calendar. Each period opens and closes on its own dates; after the grace days it can lock automatically.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>System</Label>
          <div className="flex gap-2">
            {(["term", "semester"] as CalendarMode[]).map((m) => (
              <Button
                key={m}
                type="button"
                variant={cal.mode === m ? "default" : "outline"}
                onClick={() => setCal({ ...cal, mode: m, periods: defaultPeriods(m, startMonth) })}
              >
                {MODE_LABEL[m].plural}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cal-year">Academic year</Label>
          <Input id="cal-year" value={cal.academicYear} onChange={(e) => setCal({ ...cal, academicYear: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cal-grace">Grace days after a {label.singular.toLowerCase()} ends</Label>
          <Input
            id="cal-grace"
            type="number"
            min={0}
            max={120}
            value={cal.graceDays}
            onChange={(e) => setCal({ ...cal, graceDays: Math.max(0, Number(e.target.value) || 0) })}
          />
        </div>
      </div>

      <label className="flex items-center gap-3 text-sm">
        <Switch checked={cal.lockAfterGrace} onCheckedChange={(v) => setCal({ ...cal, lockAfterGrace: v })} />
        Lock a {label.singular.toLowerCase()} automatically when its grace days pass (no new attendance or scores)
      </label>

      <div className="space-y-3">
        {cal.periods.map((p, i) => {
          const status = p.start && p.end ? periodStatus(cal, p) : "upcoming";
          return (
            <div key={i} className="grid items-end gap-3 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={p.name} onChange={(e) => setPeriod(i, "name", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Starts</Label>
                <Input type="date" value={p.start} onChange={(e) => setPeriod(i, "start", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Ends</Label>
                <Input type="date" value={p.end} onChange={(e) => setPeriod(i, "end", e.target.value)} />
              </div>
              <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${p.name}`}
                disabled={cal.periods.length <= 1}
                onClick={() => setCal({ ...cal, periods: cal.periods.filter((_, j) => j !== i) })}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={cal.periods.length >= 6}
          onClick={() =>
            setCal({
              ...cal,
              periods: [...cal.periods, { name: `${label.singular} ${cal.periods.length + 1}`, start: "", end: "" }],
            })
          }
        >
          <Plus className="size-4" /> Add {label.singular.toLowerCase()}
        </Button>
        <Button type="button" variant="outline" onClick={() => setCal({ ...cal, periods: defaultPeriods(cal.mode, startMonth) })}>
          <Wand2 className="size-4" /> Fill default dates
        </Button>
        <Button type="button" onClick={onSave} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save calendar
        </Button>
      </div>
    </div>
  );
}
