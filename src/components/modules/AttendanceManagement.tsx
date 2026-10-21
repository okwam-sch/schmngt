import { Pager, usePaged } from "@/components/portal/Paged";
import { PeriodDateInput } from "@/components/portal/PeriodFields";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarCheck, Download, Loader2, Save } from "lucide-react";
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
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@/lib/attendance.schemas";
import {
  getAttendanceAccess,
  getAttendanceClasses,
  getAttendanceHistory,
  getClassRegister,
  saveAttendance,
} from "@/lib/attendance.functions";

interface ClassOption {
  className: string;
  students: number;
  teacherName: string | null;
}

interface RegisterStudent {
  id: string;
  admission_number: string | null;
  student_name: string;
  parent_name: string | null;
  parent_phone: string | null;
  status: string;
  note: string;
}

interface HistoryRow {
  date: string;
  className: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
}

const today = () => new Date().toISOString().slice(0, 10);

export function AttendanceManagement() {
  const loadClasses = useServerFn(getAttendanceClasses);
  const loadRegister = useServerFn(getClassRegister);
  const save = useServerFn(saveAttendance);
  const loadHistory = useServerFn(getAttendanceHistory);
  const loadAccess = useServerFn(getAttendanceAccess);

  const [access, setAccess] = useState<{ allowed: boolean; isAdmin: boolean; classes: string[] } | null>(
    null,
  );
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [className, setClassName] = useState("");
  const [date, setDate] = useState(today());
  const [students, setStudents] = useState<RegisterStudent[]>([]);
  const [alreadyRecorded, setAlreadyRecorded] = useState(0);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refreshHistory = async () => {
    try {
      setHistory((await loadHistory()) as HistoryRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load attendance history.");
    }
  };

  useEffect(() => {
    void (async () => {
      let granted = { allowed: false, isAdmin: false, classes: [] as string[] };
      try {
        granted = (await loadAccess()) as typeof granted;
        setAccess(granted);
        if (!granted.allowed) {
          setLoading(false);
          return;
        }
        const all = (await loadClasses()) as ClassOption[];
        const list = granted.isAdmin
          ? all
          : all.filter((c) => granted.classes.includes(c.className));
        setClasses(list);
        if (list[0]) setClassName(list[0].className);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load classes.");
      } finally {
        setLoading(false);
      }
      if (granted.allowed) await refreshHistory();
    })();
  }, []);

  useEffect(() => {
    if (!className || !date) {
      setStudents([]);
      return;
    }
    let active = true;
    void loadRegister({ data: { className, date } })
      .then((r) => {
        if (!active) return;
        setStudents(r.students as RegisterStudent[]);
        setAlreadyRecorded(r.alreadyRecorded);
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Could not load the register."),
      );
    return () => {
      active = false;
    };
  }, [className, date]);

  const summary = useMemo(() => {
    const count = (s: string) => students.filter((x) => x.status === s).length;
    return {
      total: students.length,
      present: count("Present"),
      absent: count("Absent"),
      late: count("Late"),
      excused: count("Excused"),
    };
  }, [students]);

  const setStatus = (id: string, status: string) =>
    setStudents((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
  const setNote = (id: string, note: string) =>
    setStudents((rows) => rows.map((r) => (r.id === id ? { ...r, note } : r)));

  const markAll = (status: AttendanceStatus) =>
    setStudents((rows) => rows.map((r) => ({ ...r, status })));

  const submit = async () => {
    if (students.length === 0) return;
    setBusy(true);
    try {
      await save({
        data: {
          className,
          date,
          entries: students.map((s) => ({
            admissionId: s.id,
            status: s.status as AttendanceStatus,
            note: s.note,
          })),
        },
      });
      toast.success(
        alreadyRecorded > 0 ? "Attendance updated." : "Attendance saved for the whole class.",
      );
      setAlreadyRecorded(students.length);
      await refreshHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save attendance.");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    downloadCsv(`attendance-${className}-${date}.csv`, [
      ["Admission No", "Student", "Class", "Date", "Status", "Note"],
      ...students.map((s) => [
        s.admission_number ?? "",
        s.student_name,
        className,
        date,
        s.status,
        s.note,
      ]),
    ]);
  };

  const historyPage = usePaged(history, 25);

  if (loading) {
    return (
      <div className="surface flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Loading attendance…
      </div>
    );
  }

  if (access && !access.allowed) {
    return (
      <section className="surface p-6">
        <h2 className="text-lg font-semibold">Attendance is not available to you</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Attendance is open to administrators and to staff who have been given class teacher
          responsibility for a class under Admissions.
        </p>
      </section>
    );
  }

  return (
    <Tabs defaultValue="register" className="space-y-6">
      <TabsList>
        <TabsTrigger value="register">Daily register</TabsTrigger>
        <TabsTrigger value="history">Records</TabsTrigger>
      </TabsList>

      <TabsContent value="register" className="space-y-4">
        <div className="surface grid gap-4 p-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Class</Label>
            <Select value={className} onValueChange={setClassName}>
              <SelectTrigger>
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.className} value={c.className}>
                    {c.className} ({c.students})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="att-date">Date</Label>
            <PeriodDateInput id="att-date" value={date} onChange={setDate} />
          </div>
          <div className="space-y-2">
            <Label>Class teacher</Label>
            <p className="pt-2 text-sm text-muted-foreground">
              {classes.find((c) => c.className === className)?.teacherName ?? "Not assigned"}
            </p>
          </div>
        </div>

        {classes.length === 0 && (
          <div className="surface p-6 text-sm text-muted-foreground">
            No classes yet. Admit students first and their classes will appear here.
          </div>
        )}

        {students.length > 0 && (
          <>
            {alreadyRecorded > 0 && (
              <div className="surface border-l-4 border-warning p-4 text-sm">
                Attendance already exists for {className} on {date}. Changing it below updates the
                existing register.
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-5">
              <Stat label="Students" value={summary.total} />
              <Stat label="Present" value={summary.present} />
              <Stat label="Absent" value={summary.absent} />
              <Stat label="Late" value={summary.late} />
              <Stat label="Excused" value={summary.excused} />
            </div>

            <div className="flex flex-wrap gap-2">
              {ATTENDANCE_STATUSES.map((s) => (
                <Button key={s} size="sm" variant="outline" onClick={() => markAll(s)}>
                  Mark all {s.toLowerCase()}
                </Button>
              ))}
              <Button size="sm" variant="outline" className="ml-auto" onClick={exportCsv}>
                <Download className="size-4" aria-hidden /> Export CSV
              </Button>
            </div>

            <div className="surface overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left">
                  <tr>
                    <th className="p-3 font-medium">Admission No</th>
                    <th className="p-3 font-medium">Student</th>
                    <th className="p-3 font-medium">Parent / Guardian</th>
                    <th className="p-3 font-medium">Contact</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id} className="border-b border-border/60">
                      <td className="p-3 font-mono text-xs">{s.admission_number ?? ""}</td>
                      <td className="p-3 font-medium">{s.student_name}</td>
                      <td className="p-3">{s.parent_name ?? "—"}</td>
                      <td className="p-3">{s.parent_phone ?? "—"}</td>
                      <td className="p-3">
                        <Select value={s.status} onValueChange={(v) => setStatus(s.id, v)}>
                          <SelectTrigger className="w-[130px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ATTENDANCE_STATUSES.map((st) => (
                              <SelectItem key={st} value={st}>
                                {st}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-3">
                        <Input
                          value={s.note}
                          placeholder="Optional"
                          onChange={(e) => setNote(s.id, e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button onClick={submit} disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Save className="size-4" aria-hidden />
              )}
              {alreadyRecorded > 0 ? "Update attendance" : "Save attendance"}
            </Button>
          </>
        )}

        {classes.length > 0 && students.length === 0 && (
          <div className="surface flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <CalendarCheck className="size-4" aria-hidden /> No students found in this class.
          </div>
        )}
      </TabsContent>

      <TabsContent value="history">
        <div className="surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left">
              <tr>
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 font-medium">Class</th>
                <th className="p-3 font-medium">Students</th>
                <th className="p-3 font-medium">Present</th>
                <th className="p-3 font-medium">Absent</th>
                <th className="p-3 font-medium">Late</th>
                <th className="p-3 font-medium">Excused</th>
              </tr>
            </thead>
            <tbody>
              {historyPage.items.map((h) => (
                <tr key={`${h.date}-${h.className}`} className="border-b border-border/60">
                  <td className="p-3">{h.date}</td>
                  <td className="p-3 font-medium">{h.className}</td>
                  <td className="p-3">{h.total}</td>
                  <td className="p-3 text-success">{h.present}</td>
                  <td className="p-3 text-destructive">{h.absent}</td>
                  <td className="p-3">{h.late}</td>
                  <td className="p-3">{h.excused}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td className="p-6 text-center text-muted-foreground" colSpan={7}>
                    No attendance has been recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="px-4 pb-3"><Pager {...historyPage} /></div>
        </div>
      </TabsContent>
    </Tabs>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
