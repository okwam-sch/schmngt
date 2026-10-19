import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAcademicCalendar } from "@/hooks/useAcademicCalendar";
import { STATUS_LABEL, periodForDate, periodStatus } from "@/lib/academic-calendar";

/**
 * Date input bound to the academic calendar: limited to the academic year,
 * and shows which term/semester the date falls in and its lifecycle stage.
 * Works controlled (value/onChange) or uncontrolled in a form (name).
 */
export function PeriodDateInput({
  id,
  name,
  value,
  onChange,
  required,
}: {
  id?: string;
  name?: string;
  value?: string;
  onChange?: (v: string) => void;
  required?: boolean;
}) {
  const cal = useAcademicCalendar();
  const p = value ? periodForDate(cal.calendar, value) : null;
  return (
    <div className="space-y-1">
      <Input
        id={id}
        name={name}
        type="date"
        required={required}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        min={cal.periods[0]?.start}
        max={cal.periods[cal.periods.length - 1]?.end}
      />
      {value !== undefined && (
        <p className="text-xs text-muted-foreground">
          {p
            ? `${p.name} · ${STATUS_LABEL[periodStatus(cal.calendar, p)]}`
            : `Outside any configured ${cal.labels.singular.toLowerCase()}`}
        </p>
      )}
    </div>
  );
}

/** Term/semester picker from the academic calendar; locked periods are disabled. */
export function PeriodSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const cal = useAcademicCalendar();
  return (
    <Select value={value || cal.current?.name || ""} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={`Select ${cal.labels.singular.toLowerCase()}`} />
      </SelectTrigger>
      <SelectContent>
        {cal.periods.map((p) => (
          <SelectItem key={p.name} value={p.name} disabled={p.status === "locked"}>
            {p.name} · {STATUS_LABEL[p.status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
