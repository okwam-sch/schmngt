import { LogoWatermark, SchoolLogo } from "@/components/branding/SchoolLogo";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAcademicCalendar } from "@/hooks/useAcademicCalendar";
import { getReportOptions, getTermlyReport } from "@/lib/reports.functions";
import { ordinal } from "@/lib/reports";
import { useFinanceConfig } from "@/hooks/useFinanceConfig";
import { useSchoolName } from "@/hooks/useSchoolName";

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

export function TermlyReports() {
  const school = useSchoolName();
  const { money } = useFinanceConfig();
  const optionsFn = useServerFn(getReportOptions);
  const reportFn = useServerFn(getTermlyReport);
  const [admissionId, setAdmissionId] = useState("");
  const cal = useAcademicCalendar();
  const [term, setTerm] = useState("");
  const [extra, setExtra] = useState({
    nextTerm: "",
    promoted: "",
    conduct: "",
    teacherName: "",
    teacherRemarks: "",
    headRemarks: "",
  });
  const set = (k: keyof typeof extra) => (e: { target: { value: string } }) =>
    setExtra((x) => ({ ...x, [k]: e.target.value }));

  const options = useQuery({ queryKey: ["report-options"], queryFn: () => optionsFn() });
  const report = useQuery({
    queryKey: ["termly-report", admissionId, term],
    queryFn: () => reportFn({ data: { admissionId, term } }),
    enabled: !!admissionId && !!term,
  });
  const r = report.data;
  // "Next term begins" comes from the following period in the academic calendar.
  useEffect(() => {
    setExtra((x) => ({ ...x, nextTerm: r?.nextPeriod?.start ?? "" }));
  }, [r?.nextPeriod?.start, admissionId, term]);

  return (
    <div className="space-y-6">
      <section className="surface grid gap-4 p-6 sm:grid-cols-2 print:hidden">
        <div className="space-y-1.5">
          <Label htmlFor="rc-student">Student</Label>
          <select id="rc-student" className={selectCls} value={admissionId} onChange={(e) => setAdmissionId(e.target.value)}>
            <option value="">Select a student…</option>
            {options.data?.students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.student_name} — {s.class_admitted}
                {s.admission_number ? ` (${s.admission_number})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rc-term">{cal.labels.singular}</Label>
          <select id="rc-term" className={selectCls} value={term} onChange={(e) => setTerm(e.target.value)}>
            <option value="">Select a {cal.labels.singular.toLowerCase()}…</option>
            {[...new Set([...cal.periods.map((p) => p.name), ...(options.data?.terms ?? [])])].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

        </div>
      </section>

      {report.isLoading && <p className="text-sm text-muted-foreground">Building report…</p>}
      {report.error && <p className="text-sm text-destructive">{(report.error as Error).message}</p>}

      {r && (
        <article className="surface relative space-y-6 overflow-hidden p-6 print:border-0 print:shadow-none" id="report-card">
          <LogoWatermark />
          <header className="relative text-center">
            <SchoolLogo size="document" className="mx-auto mb-2" />
            <h2 className="text-xl font-bold uppercase">{school.name}</h2>
            {school.tagline && <p className="text-sm text-muted-foreground">{school.tagline}</p>}
            <p className="mt-1 font-semibold uppercase tracking-wide">Learner's Report Card</p>
          </header>

          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <Field label="Name of student" value={r.student.student_name} />
            <Field label="Form" value={r.student.class_admitted} />
            <Field label={cal.labels.singular} value={r.term} />
            <Field label="Number on roll" value={String(r.numberOnRoll)} />
            {r.rules.showPosition && <Field label="Position" value={r.position ? ordinal(r.position) : "—"} />}
            <div>
              <Label htmlFor="rc-next">
                Next {cal.labels.singular.toLowerCase()} begins
                {r.nextPeriod ? ` (${r.nextPeriod.name})` : ""}
              </Label>
              <Input id="rc-next" type="date" value={extra.nextTerm} onChange={set("nextTerm")} />
              {!r.nextPeriod && (
                <p className="mt-1 text-xs text-muted-foreground print:hidden">
                  No following {cal.labels.singular.toLowerCase()} in the academic calendar yet — add it in Academic Configuration or enter the date.
                </p>
              )}
            </div>
          </dl>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted">
                  {["Subjects", `Class Score (${r.rules.weights.classWeight}%)`, `Exams Score (${r.rules.weights.examWeight}%)`, "Total Score (100%)", ...(r.rules.showPosition ? ["Position in Subject"] : []), "Grade", "Level of Proficiency"].map((h) => (
                    <th key={h} className="border border-border p-2 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.subjects.length === 0 && (
                  <tr><td colSpan={7} className="border border-border p-3 text-center text-muted-foreground">No scores recorded for this term.</td></tr>
                )}
                {r.subjects.map((s) => (
                  <tr key={s.subject}>
                    <td className="border border-border p-2">{s.subject}</td>
                    <td className="border border-border p-2">{s.classScore.toFixed(1)}</td>
                    <td className="border border-border p-2">{s.examScore.toFixed(1)}</td>
                    <td className="border border-border p-2 font-medium">{s.total.toFixed(1)}</td>
                    {r.rules.showPosition && <td className="border border-border p-2">{ordinal(s.position)}</td>}
                    <td className="border border-border p-2">{s.grade}</td>
                    <td className="border border-border p-2">{s.level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-3">
            {r.rules.showAttendance && (
              <Field label="Attendance" value={`${r.attendance.present} out of ${r.attendance.total}`} />
            )}
            <div>
              <Label htmlFor="rc-prom">
                Repeat / promoted to
                {r.rules.promotionMark !== null && ` (promotion average ${r.rules.promotionMark}%)`}
              </Label>
              <Input id="rc-prom" value={extra.promoted} onChange={set("promoted")} />
            </div>
            <div>
              <Label htmlFor="rc-cond">Conduct / attitude</Label>
              <Input id="rc-cond" value={extra.conduct} onChange={set("conduct")} />
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <Label htmlFor="rc-tn">Class teacher's name</Label>
              <Input id="rc-tn" value={extra.teacherName} onChange={set("teacherName")} />
            </div>
            <div>
              <Label htmlFor="rc-tr">Class teacher's remarks</Label>
              <Textarea id="rc-tr" value={extra.teacherRemarks} onChange={set("teacherRemarks")} />
            </div>
            <div>
              <Label htmlFor="rc-hr">Head teacher's remarks</Label>
              <Textarea id="rc-hr" value={extra.headRemarks} onChange={set("headRemarks")} />
            </div>
            <p className="pt-4">Head teacher's stamp and signature: ___________________________</p>
          </div>

          {r.rules.showBill && <section>
            <h3 className="mb-2 font-semibold uppercase">Student's Bill</h3>
            {r.bill ? (
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <Field label="Approved fees" value={money(r.bill.approvedFees)} />
                <Field label="Arrears" value={money(r.bill.arrears)} />
                <Field label="Amount due" value={money(r.bill.amountDue)} />
                <Field label="Payment made" value={money(r.bill.paymentMade)} />
                <Field label="Balance" value={money(r.bill.balance)} />
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">Fee details are only visible to finance administrators.</p>
            )}
          </section>}

          <div className="flex gap-2 print:hidden">
            <Button onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden /> Print / Save as PDF
            </Button>
          </div>
        </article>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
