import { useEffect, useState } from "react";
import { Hash, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  admissionNumberingSchema,
  employeeNumberingSchema,
  type AdmissionNumberingInput,
  type EmployeeNumberingInput,
} from "@/lib/config.schemas";
import {
  DEFAULT_NUMBER_FORMAT,
  capacity,
  composedLength,
  previewNumber,
  schoolCodeDigits,
  type NumberingSettings,
} from "@/lib/numbering";

/**
 * One numbering editor, scoped to its owner: "admission" is edited in
 * Operations Configuration, "employee" (with the shared school code) in
 * System & Platform Configuration. Each save writes only its own columns.
 */
type Kind = "admission" | "employee";
type Errors = Record<string, string>;
type Form = Record<string, string | number>;

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | undefined; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

const DEFAULTS: Record<Kind, { total: number; seq: number; min: number }> = {
  admission: { total: 10, seq: 4, min: 6 },
  employee: { total: 7, seq: 1, min: 5 },
};

function initial(kind: Kind, school: { id: string; code: string }, n: NumberingSettings | null): Form {
  const d = DEFAULTS[kind];
  const k = (f: string) => (n as unknown as Record<string, unknown> | null)?.[`${kind}_${f}`];
  const base: Form = {
    schoolId: school.id,
    [`${kind}Format`]: (k("format") as string) ?? DEFAULT_NUMBER_FORMAT,
    [`${kind}TotalDigits`]: (k("total_digits") as number) ?? d.total,
    [`${kind}YearDigits`]: (k("year_digits") as number) ?? 2,
    [`${kind}SequenceDigits`]: (k("sequence_digits") as number) ?? d.seq,
    [`${kind}SequenceStart`]: (k("sequence_start") as number) ?? 1,
  };
  if (kind === "employee") {
    base["schoolCode"] = n?.school_code ?? schoolCodeDigits(school.code);
    base["employeeAllocationMode"] = n?.employee_allocation_mode ?? "compact";
  }
  return base;
}

export function NumberingSection<K extends Kind>({
  kind,
  school,
  numbering,
  busy,
  onSave,
}: {
  kind: K;
  school: { id: string; code: string; name: string } | null;
  numbering: NumberingSettings | null;
  busy: boolean;
  onSave: (payload: K extends "admission" ? AdmissionNumberingInput : EmployeeNumberingInput) => Promise<boolean>;
}) {
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    setForm(school ? initial(kind, school, numbering) : null);
    setErrors({});
  }, [school, numbering, kind]);

  if (!school || !form) {
    return <p className="text-sm text-muted-foreground">Add a school first to set up numbering.</p>;
  }

  const f = (name: string) => form[`${kind}${name}`] as number;
  const fmt = form[`${kind}Format`] as string;
  const set = (key: string, value: string | number) => setForm((cur) => (cur ? { ...cur, [key]: value } : cur));
  const code = (form["schoolCode"] as string | undefined) ?? schoolCodeDigits(numbering?.school_code ?? school.code);
  const preview = previewNumber({ format: fmt, schoolCode: code, yearDigits: f("YearDigits"), sequenceDigits: f("SequenceDigits"), sequenceStart: f("SequenceStart") });
  const length = composedLength(fmt, f("YearDigits"), f("SequenceDigits"));
  const d = DEFAULTS[kind];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = (kind === "admission" ? admissionNumberingSchema : employeeNumberingSchema).safeParse(form);
    if (!result.success) {
      const next: Errors = {};
      for (const issue of result.error.issues) next[issue.path.join(".") || "form"] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    await onSave(result.data as never);
  };

  const num = (name: string, label: string, min: number, max: number) => (
    <Field label={label} error={errors[`${kind}${name}`]}>
      <Input type="number" min={min} max={max} value={f(name)} onChange={(e) => set(`${kind}${name}`, Number(e.target.value))} />
    </Field>
  );

  return (
    <form onSubmit={submit} className="space-y-6">
      {kind === "employee" ? (
        <div className="rounded-xl border border-border p-5">
          <p className="flex items-center gap-2 text-sm font-semibold"><Hash className="size-4" aria-hidden /> School code</p>
          <p className="mt-1 text-xs text-muted-foreground">Four digits that begin every admission number and employee ID for {school.name}.</p>
          <div className="mt-3 max-w-[200px]">
            <Field label="School code (4 digits)" error={errors["schoolCode"]}>
              <Input inputMode="numeric" maxLength={4} className="font-mono" value={code} onChange={(e) => set("schoolCode", e.target.value.replace(/\D/g, "").slice(0, 4))} />
            </Field>
          </div>
        </div>
      ) : null}

      <fieldset className="max-w-2xl space-y-4 rounded-xl border border-border p-5">
        <legend className="px-1 text-sm font-semibold">{kind === "admission" ? "Admission numbering" : "Employee numbering"}</legend>
        <Field label="Template" hint="Use {SCHOOL}, {YY} and {SEQ}." error={errors[`${kind}Format`]}>
          <Input className="font-mono" value={fmt} onChange={(e) => set(`${kind}Format`, e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          {num("TotalDigits", "Total digits", d.min, 20)}
          {num("YearDigits", "Year digits", 0, 4)}
          {num("SequenceDigits", "Sequence digits", 1, 8)}
          {num("SequenceStart", "Sequence starts at", 0, 99999999)}
        </div>
        {kind === "employee" ? (
          <Field label="Allocation" hint="Compact fills numbers in order; random picks an unused number in the range." error={errors["employeeAllocationMode"]}>
            <Select value={form["employeeAllocationMode"] as string} onValueChange={(v) => set("employeeAllocationMode", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">Compact (sequential)</SelectItem>
                <SelectItem value="random">Random</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <p className="text-xs text-muted-foreground">School code {code} is set under System & Platform Configuration → Numbering.</p>
        )}
        <p className="text-sm">{kind === "admission" ? "Next number" : "Example"}: <span className="font-mono font-semibold">{preview}</span></p>
        <p className="text-xs text-muted-foreground">
          {length} characters produced · {capacity(f("SequenceDigits"), f("SequenceStart")).toLocaleString()} {kind === "admission" ? "students" : "staff"} per year
          {length !== f("TotalDigits") ? " · does not match the total length above" : ""}
        </p>
      </fieldset>
      <Button type="submit" disabled={busy}><Save className="size-4" aria-hidden /> Save numbering</Button>
    </form>
  );
}
