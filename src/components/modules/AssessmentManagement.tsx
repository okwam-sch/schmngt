import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Loader2, Pencil, Printer, Save, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SchoolLogo } from "@/components/branding/SchoolLogo";
import { useAcademicCalendar } from "@/hooks/useAcademicCalendar";
import { useAcademicRules } from "@/hooks/useAcademicRules";
import { useSchoolClasses } from "@/hooks/useSchoolClasses";
import { useSubjectOptions } from "@/hooks/useSubjectOptions";
import { useSchoolName } from "@/hooks/useSchoolName";
import { PeriodSelect } from "@/components/portal/PeriodFields";
import { Pager } from "@/components/portal/Paged";
import { subjectsForClass } from "@/lib/education-levels";
import { activeAssessmentTypes, assessmentWeights, num, percentOf } from "@/lib/academic-rules";
import { assessmentCsv, assessmentTotals } from "@/lib/assessment";
import { printDocument } from "@/lib/print-document";
import { assessmentSelectionSchema, type AssessmentSelection } from "@/lib/assessment.schemas";
import { getMyTeachingScope } from "@/lib/teaching.functions";
import {
  deleteAssessment,
  getAssessmentContext,
  getAssessmentStudents,
  listAssessments,
  saveAssessment,
} from "@/lib/assessment.functions";

type Student = Awaited<ReturnType<typeof getAssessmentStudents>>["rows"][number];
type RecordRow = Awaited<ReturnType<typeof listAssessments>>["rows"][number];
type Context = Awaited<ReturnType<typeof getAssessmentContext>>;
type Draft = { score: string; remark: string; createId?: string };
const PAGE_SIZE = 50;

function download(name: string, rows: unknown[][]) {
  const url = URL.createObjectURL(
    new Blob([assessmentCsv(rows)], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function AssessmentManagement() {
  const rosterFn = useServerFn(getAssessmentStudents),
    recordsFn = useServerFn(listAssessments),
    contextFn = useServerFn(getAssessmentContext);
  const save = useServerFn(saveAssessment),
    remove = useServerFn(deleteAssessment),
    scopeFn = useServerFn(getMyTeachingScope);
  const calendar = useAcademicCalendar(),
    configuredRules = useAcademicRules(),
    school = useSchoolName();
  const { names, classes } = useSchoolClasses();
  const { catalog } = useSubjectOptions();
  const [scope, setScope] = useState<Awaited<ReturnType<typeof getMyTeachingScope>> | null>(null);
  const [selection, setSelection] = useState({ className: "", subject: "", term: "" });
  const [loaded, setLoaded] = useState<AssessmentSelection | null>(null);
  const [context, setContext] = useState<Context | null>(null);
  const [students, setStudents] = useState<Student[]>([]),
    [rows, setRows] = useState<RecordRow[]>([]);
  const [rosterTotal, setRosterTotal] = useState(0),
    [recordTotal, setRecordTotal] = useState(0);
  const [rosterPage, setRosterPage] = useState(0),
    [recordPage, setRecordPage] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [type, setType] = useState(""),
    [outOf, setOutOf] = useState("");
  const [studentFilter, setStudentFilter] = useState("all"),
    [report, setReport] = useState<RecordRow[] | null>(null);
  const [editing, setEditing] = useState<RecordRow | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const reportRef = useRef<HTMLElement>(null);
  const rules = context?.rules ?? configuredRules,
    types = activeAssessmentTypes(rules);
  const chosenType = type || types[0] || "",
    maximum = outOf || String(num(rules, "assessment", "default-out-of") ?? "");
  const chosen = { ...selection, term: selection.term || calendar.current?.name || "" };
  const classOptions = scope && !scope.isAdmin ? scope.classes : names;
  const className = chosen.className || (classOptions.length === 1 ? (classOptions[0] ?? "") : "");
  const subjectOptions =
    scope && !scope.isAdmin
      ? [...new Set(scope.pairs.filter((p) => p.class_name === className).map((p) => p.subject))]
      : subjectsForClass(catalog, classes, className);
  const subject = chosen.subject || (subjectOptions.length === 1 ? (subjectOptions[0] ?? "") : "");
  const effective = { ...chosen, className, subject };
  const hasDrafts = Object.keys(drafts).length > 0;

  useEffect(() => {
    let on = true;
    scopeFn()
      .then((s) => {
        if (on) setScope(s);
      })
      .catch((e: unknown) => {
        if (on) setError(e instanceof Error ? e.message : "Could not verify permissions.");
      });
    return () => {
      on = false;
    };
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      const message = e instanceof Error ? e.message : "The request failed.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };
  const change = (next: typeof selection) => {
    if (hasDrafts && !window.confirm("Discard unsaved scores?")) return;
    setSelection(next);
    setLoaded(null);
    setContext(null);
    setStudents([]);
    setRows([]);
    setReport(null);
    setDrafts({});
    setEditing(null);
    setStudentFilter("all");
  };
  const fetchRoster = async (s: AssessmentSelection, page = 0) => {
    const result = await rosterFn({ data: { ...s, page, pageSize: PAGE_SIZE } });
    setStudents(result.rows);
    setRosterTotal(result.total);
    setRosterPage(page);
  };
  const fetchRecords = async (s: AssessmentSelection, page = 0) => {
    const result = await recordsFn({ data: { ...s, page, pageSize: PAGE_SIZE } });
    setRows(result.rows);
    setRecordTotal(result.total);
    setRecordPage(page);
  };
  const selected = (): AssessmentSelection => assessmentSelectionSchema.parse(effective);
  const recordSelection = (): AssessmentSelection => ({
    ...selected(),
    ...(studentFilter !== "all" ? { admissionId: studentFilter } : {}),
  });
  const loadRoster = () =>
    run(async () => {
      if (hasDrafts && !window.confirm("Discard unsaved scores and reload?")) return;
      const s = selected();
      const metadata = await contextFn({ data: s });
      await fetchRoster(s);
      setLoaded(s);
      setContext(metadata);
      setDrafts({});
      setEditing(null);
      setReport(null);
    });
  // Chunked, exact selection; fail explicitly rather than exporting a silently truncated result.
  const allRecords = async (s: AssessmentSelection) => {
    const result: RecordRow[] = [];
    let page = 0;
    while (true) {
      const batch = await recordsFn({ data: { ...s, page, pageSize: 1000 } });
      result.push(...batch.rows);
      if (result.length >= batch.total) break;
      if (!batch.rows.length || page >= 99)
        throw new Error(
          "Selection is too large or changed during export; select one student and retry.",
        );
      page++;
    }
    return result;
  };
  const exportRecords = () =>
    run(async () => {
      const s = recordSelection();
      const records = await allRecords(s);
      if (!records.length) throw new Error("No assessment records match this selection.");
      download("assessments.csv", [
        [
          "Admission number",
          "Student",
          "Class",
          "Period",
          "Subject",
          "Type",
          "Score",
          "Out of",
          "Percentage",
          "Remark",
        ],
        ...records.map((r) => [
          r.admissionNumber,
          r.studentName,
          r.className,
          r.term,
          r.subject,
          r.assessmentType,
          r.score,
          r.outOf,
          percentOf(r.score, r.outOf),
          r.remark,
        ]),
      ]);
    });
  const template = () =>
    run(async () => {
      const s = selected();
      const roster: Student[] = [];
      let page = 0;
      while (true) {
        const batch = await rosterFn({ data: { ...s, page, pageSize: 1000 } });
        roster.push(...batch.rows);
        if (roster.length >= batch.total) break;
        if (!batch.rows.length || page >= 99)
          throw new Error("Class list is too large or changed; please reload.");
        page++;
      }
      if (!roster.length) throw new Error("No enrolled students in this class.");
      download("class-list-template.csv", [
        [
          "Admission number",
          "Student",
          "Class",
          "Subject",
          "Period",
          "Assessment type",
          "Score",
          "Out of",
          "Remark",
        ],
        ...roster.map((s) => [
          s.admission_number,
          s.student_name,
          s.class_admitted,
          subject,
          effective.term,
          chosenType,
          "",
          maximum,
          "",
        ]),
      ]);
    });
  const saveRoster = () =>
    run(async () => {
      if (!loaded) return;
      const entries = Object.entries(drafts).filter(([, d]) => d.score.trim() !== "");
      if (!entries.length) throw new Error("Enter at least one score.");
      // Validate all entered scores before the first write; keep only failed/unsaved rows for retry.
      const max = Number(maximum);
      if (!Number.isFinite(max) || max <= 0 || !chosenType)
        throw new Error("Select an active type and a positive maximum score.");
      if (entries.some(([, d]) => !Number.isFinite(Number(d.score)) || Number(d.score) < 0))
        throw new Error("Scores must be non-negative numbers.");
      let saved = 0;
      for (const [admissionId, d] of entries) {
        try {
          const createId = d.createId ?? crypto.randomUUID();
          setDrafts((current) => ({ ...current, [admissionId]: { ...d, createId } }));
          await save({
            data: {
              ...loaded,
              admissionId,
              createId,
              assessmentType: chosenType,
              score: Number(d.score),
              outOf: max,
              remark: d.remark,
            },
          });
          saved++;
          setDrafts((current) => {
            const next = { ...current };
            delete next[admissionId];
            return next;
          });
        } catch (e) {
          setReport(null);
          throw new Error(
            `${saved} saved; remaining scores kept. ${e instanceof Error ? e.message : "Save failed."}`,
          );
        }
      }
      setReport(null);
      toast.success(`${saved} assessment records saved.`);
    });
  const loadReport = () =>
    run(async () => {
      const s = recordSelection();
      const metadata = await contextFn({ data: s });
      const records = await allRecords(s);
      setLoaded(s);
      setContext(metadata);
      setReport(records);
    });
  const totals = useMemo(() => assessmentTotals(report ?? [], rules), [report, rules]);
  const reportRows = [...totals.entries()].flatMap(([id, subjects]) =>
    [...subjects.entries()].map(([sub, result]) => ({
      id,
      subject: sub,
      student: report?.find((r) => r.admissionId === id),
      ...result,
    })),
  );
  const weights = assessmentWeights(rules);
  const print = () => {
    if (!reportRef.current || !report?.length) return;
    printDocument(reportRef.current, "Assessment report");
  };
  const update = () =>
    run(async () => {
      if (!editing) return;
      await save({
        data: {
          id: editing.id,
          admissionId: editing.admissionId,
          className: editing.className,
          subject: editing.subject,
          term: editing.term,
          assessmentType: editing.assessmentType,
          score: editing.score,
          outOf: editing.outOf,
          remark: editing.remark,
        },
      });
      setEditing(null);
      setReport(null);
      await fetchRecords(recordSelection(), recordPage);
      toast.success("Assessment updated.");
    });

  return (
    <div className="space-y-5">
      <fieldset disabled={busy} className="space-y-4 border-b border-border pb-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Class / Form">
            <Choice
              label="Class / Form"
              value={className}
              options={classOptions}
              onChange={(v) => change({ ...selection, className: v, subject: "" })}
            />
          </Field>
          <Field label="Subject">
            <Choice
              label="Subject"
              value={subject}
              options={subjectOptions}
              onChange={(v) => change({ ...selection, className, subject: v })}
            />
          </Field>
          <Field label={calendar.labels.singular}>
            <PeriodSelect
              value={effective.term}
              onChange={(v) => change({ ...selection, className, subject, term: v })}
            />
          </Field>
        </div>
        <div className="grid gap-4 text-sm sm:grid-cols-3">
          <Meta label="School" value={context?.school ?? school.name} />
          <Meta
            label="Session / Year"
            value={
              context ? (context.academicYear ?? "Not configured") : calendar.calendar.academicYear
            }
          />
          <Meta
            label="Subject teacher"
            value={
              context ? context.teachers.map((t) => t.full_name).join(", ") || "Not assigned" : "—"
            }
          />
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Processing…
        </p>
      )}
      <Tabs defaultValue="roster" className="space-y-4">
        <TabsList>
          <TabsTrigger value="roster">Roster entry</TabsTrigger>
          <TabsTrigger value="records">Records</TabsTrigger>
          <TabsTrigger value="report">Report</TabsTrigger>
        </TabsList>
        <TabsContent value="roster" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void loadRoster()} disabled={busy || !scope}>
              <Search className="size-4" />
              Load class roster
            </Button>
            <Button variant="outline" onClick={() => void template()} disabled={busy || !scope}>
              <Download className="size-4" />
              Class list template
            </Button>
          </div>
          {loaded && students.length > 0 ? (
            <>
              <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-3">
                <Field label="Assessment type">
                  <Choice
                    label="Assessment type"
                    value={chosenType}
                    options={types}
                    onChange={setType}
                  />
                </Field>
                <Field label="Out of">
                  <Input
                    aria-label="Out of"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={maximum}
                    onChange={(e) => setOutOf(e.target.value)}
                  />
                </Field>
                <div className="flex items-end">
                  <Button onClick={() => void saveRoster()} disabled={busy || !hasDrafts}>
                    <Save className="size-4" />
                    Save entered scores
                  </Button>
                </div>
              </fieldset>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="p-2">Student</th>
                      <th className="p-2">Admission number</th>
                      <th className="w-32 p-2">Score</th>
                      <th className="p-2">Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s.id} className="border-b border-border">
                        <td className="p-2 font-medium">{s.student_name}</td>
                        <td className="p-2 text-muted-foreground">{s.admission_number ?? "—"}</td>
                        <td className="p-2">
                          <Input
                            aria-label={`Score for ${s.student_name}`}
                            disabled={busy}
                            type="number"
                            min="0"
                            step="0.01"
                            value={drafts[s.id]?.score ?? ""}
                            onChange={(e) =>
                              setDrafts((d) => ({
                                ...d,
                                [s.id]: { score: e.target.value, remark: d[s.id]?.remark ?? "" },
                              }))
                            }
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            aria-label={`Remark for ${s.student_name}`}
                            disabled={busy}
                            maxLength={300}
                            value={drafts[s.id]?.remark ?? ""}
                            onChange={(e) =>
                              setDrafts((d) => ({
                                ...d,
                                [s.id]: { score: d[s.id]?.score ?? "", remark: e.target.value },
                              }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                page={rosterPage}
                pageSize={PAGE_SIZE}
                total={rosterTotal}
                pages={Math.max(1, Math.ceil(rosterTotal / PAGE_SIZE))}
                setPage={(p) => {
                  if (!busy && loaded) void run(() => fetchRoster(loaded, p));
                }}
              />
            </>
          ) : (
            <p className="py-6 text-sm text-muted-foreground">
              {loaded ? "No enrolled students in this class." : "No class roster loaded."}
            </p>
          )}
        </TabsContent>
        <TabsContent value="records" className="space-y-4">
          <Field label="Student">
            <Select
              value={studentFilter}
              onValueChange={(v) => {
                setStudentFilter(v);
                setReport(null);
                setRows([]);
                setEditing(null);
              }}
              disabled={busy}
            >
              <SelectTrigger aria-label="Student">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All students in selected class</SelectItem>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.student_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || !scope}
              onClick={() => void run(() => fetchRecords(recordSelection()))}
            >
              <Search className="size-4" />
              Fetch records
            </Button>
            <Button
              disabled={busy || !scope}
              variant="outline"
              onClick={() => void exportRecords()}
            >
              <Download className="size-4" />
              Export CSV
            </Button>
          </div>
          {editing && (
            <fieldset disabled={busy} className="space-y-3 border-y border-border py-4">
              <h3 className="font-semibold">
                {editing.studentName} · {editing.assessmentType}
              </h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Score">
                  <Input
                    aria-label="Edit score"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editing.score}
                    onChange={(e) => setEditing({ ...editing, score: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Out of">
                  <Input
                    aria-label="Edit out of"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editing.outOf}
                    onChange={(e) => setEditing({ ...editing, outOf: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Remark">
                  <Input
                    value={editing.remark}
                    maxLength={300}
                    onChange={(e) => setEditing({ ...editing, remark: e.target.value })}
                  />
                </Field>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => void update()}>
                  <Save className="size-4" />
                  Save changes
                </Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  <X className="size-4" />
                  Cancel
                </Button>
              </div>
            </fieldset>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {["Student", "Type", "Score", "Out of", "%", "Remark", "Actions"].map((h) => (
                    <th key={h} className="p-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border">
                    <td className="p-2 font-medium">{r.studentName}</td>
                    <td className="p-2">{r.assessmentType}</td>
                    <td className="p-2">{r.score}</td>
                    <td className="p-2">{r.outOf}</td>
                    <td className="p-2">{percentOf(r.score, r.outOf).toFixed(2)}</td>
                    <td className="p-2">{r.remark}</td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        <Button
                          disabled={busy}
                          variant="ghost"
                          size="icon"
                          title="Edit assessment"
                          aria-label={`Edit ${r.studentName} assessment`}
                          onClick={() => setEditing(r)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          disabled={busy}
                          variant="ghost"
                          size="icon"
                          title="Delete assessment"
                          aria-label={`Delete ${r.studentName} assessment`}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete ${r.studentName}'s ${r.assessmentType} assessment?`,
                              )
                            )
                              void run(async () => {
                                await remove({ data: { id: r.id } });
                                setReport(null);
                                await fetchRecords(recordSelection(), recordPage);
                              });
                          }}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <p className="py-4 text-sm text-muted-foreground">
              No records loaded for this selection.
            </p>
          )}
          <Pager
            page={recordPage}
            pageSize={PAGE_SIZE}
            total={recordTotal}
            pages={Math.max(1, Math.ceil(recordTotal / PAGE_SIZE))}
            setPage={(p) => {
              if (!busy) void run(() => fetchRecords(recordSelection(), p));
            }}
          />
        </TabsContent>
        <TabsContent value="report" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !scope} onClick={() => void loadReport()}>
              <Search className="size-4" />
              Generate report
            </Button>
            <Button disabled={busy || !report?.length} variant="outline" onClick={print}>
              <Printer className="size-4" />
              Print / Save PDF
            </Button>
          </div>
          {report ? (
            <article ref={reportRef} className="space-y-4 bg-background p-4 text-foreground">
              <header className="flex items-center gap-4 border-b border-border pb-4">
                <SchoolLogo size="lg" />
                <div>
                  <h2 className="text-xl font-bold">{context?.school ?? school.name}</h2>
                  <p>
                    {loaded?.className} · {loaded?.subject} · {loaded?.term}
                  </p>
                  <p className="text-sm">
                    {context?.academicYear ?? "Session not configured"} ·{" "}
                    {context?.teachers.map((t) => t.full_name).join(", ") || "Teacher not assigned"}
                  </p>
                </div>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="p-2">Student</th>
                      <th className="p-2">Class / {weights.classWeight}</th>
                      <th className="p-2">Exam / {weights.examWeight}</th>
                      <th className="p-2">Total / 100</th>
                      <th className="p-2">Grade</th>
                      <th className="p-2">Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportRows.map((r) => (
                      <tr key={`${r.id}-${r.subject}`} className="border-b border-border">
                        <td className="p-2">
                          {r.student?.studentName}
                          <div className="text-xs text-muted-foreground">
                            {r.student?.admissionNumber}
                          </div>
                        </td>
                        <td className="p-2">
                          {r.cls.toFixed(2)}
                          {!r.classTasks ? " (pending)" : ""}
                        </td>
                        <td className="p-2">
                          {r.exam.toFixed(2)}
                          {!r.examTasks ? " (pending)" : ""}
                        </td>
                        <td className="p-2">{r.total.toFixed(2)}</td>
                        <td className="p-2">{r.grade}</td>
                        <td className="p-2">{r.level}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!reportRows.length && <p>No assessment records for this selection.</p>}
            </article>
          ) : (
            <p className="py-6 text-sm text-muted-foreground">No report generated.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="break-words font-medium">{value}</p>
    </div>
  );
}
function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
