import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AcademicCalendarSection } from "@/components/modules/AcademicCalendarSection";
import { getConfiguration, getSchoolAcademicSettings, saveAcademicSettings } from "@/lib/config.functions";
import { GRADING_SYSTEMS, MONTHS } from "@/lib/config";
import { invalidateAcademicRules } from "@/hooks/useAcademicRules";
import {
  ASSESSMENT_CATEGORIES,
  CATEGORY_LABEL,
  DEFAULT_ASSESSMENT_TYPES,
  DEFAULT_GRADE_BANDS,
  assessmentWeights,
  RULE_SECTIONS,
  SECTION_LABEL,
  missingDefaults,
  rulesSchema,
  type AcademicRule,
  type AcademicRules,
  type RuleSection,
} from "@/lib/academic-rules";

type Settings = { gradingSystem: (typeof GRADING_SYSTEMS)[number]; academicYearStartMonth: number; rules: AcademicRules };

export function AcademicConfiguration() {
  const loadConfig = useServerFn(getConfiguration);
  const load = useServerFn(getSchoolAcademicSettings);
  const save = useServerFn(saveAcademicSettings);
  const [schools, setSchools] = useState<{ id: string; name: string; code: string }[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadConfig()
      .then((c: any) => {
        setSchools(c.schools ?? []);
        setSchoolId((cur) => cur || c.schools?.[0]?.id || "");
      })
      .catch((e) => toast.error(e.message));
  }, []);

  useEffect(() => {
    if (!schoolId) return;
    setS(null);
    void load({ data: { schoolId } }).then(setS).catch((e) => toast.error(e.message));
  }, [schoolId]);

  const onSave = async () => {
    if (!s) return;
    const parsed = rulesSchema.safeParse(s.rules);
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? "Check the rules");
    setBusy(true);
    try {
      const r = await save({ data: { schoolId, gradingSystem: s.gradingSystem, academicYearStartMonth: s.academicYearStartMonth, rules: parsed.data } });
      setS({ ...s, rules: { ...parsed.data, version: r.version } });
      invalidateAcademicRules();
      toast.success("Academic settings saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setRules = (rules: AcademicRules) => s && setS({ ...s, rules });

  return (
    <div className="space-y-6">
      <section className="surface flex flex-wrap items-end justify-between gap-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">Academic settings</h2>
          <p className="text-sm text-muted-foreground">
            One place for the calendar, grading and the rules Attendance, Assessment, Timetable and Termly Reports follow.
          </p>
        </div>
        <div className="w-full max-w-xs space-y-1.5">
          <Label>School</Label>
          <Select value={schoolId} onValueChange={setSchoolId}>
            <SelectTrigger><SelectValue placeholder={schools.length ? "Select a school" : "No schools yet"} /></SelectTrigger>
            <SelectContent>
              {schools.map((x) => <SelectItem key={x.id} value={x.id}>{x.name} ({x.code})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </section>

      <Tabs defaultValue="calendar" className="surface p-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="calendar">Academic calendar</TabsTrigger>
          <TabsTrigger value="grading">Grading</TabsTrigger>
          <TabsTrigger value="types">Assessment types</TabsTrigger>
          {RULE_SECTIONS.map((k) => <TabsTrigger key={k} value={k}>{SECTION_LABEL[k].title}</TabsTrigger>)}
        </TabsList>

        <TabsContent value="calendar" className="mt-6">
          {s ? <AcademicCalendarSection schoolId={schoolId} startMonth={s.academicYearStartMonth} /> : <Spinner />}
        </TabsContent>

        <TabsContent value="grading" className="mt-6 space-y-6">
          {!s ? <Spinner /> : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Grading system</Label>
                  <Select value={s.gradingSystem} onValueChange={(v) => setS({ ...s, gradingSystem: v as Settings["gradingSystem"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{GRADING_SYSTEMS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Academic year starts</Label>
                  <Select value={String(s.academicYearStartMonth)} onValueChange={(v) => setS({ ...s, academicYearStartMonth: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <h3 className="text-base font-semibold">Grade bands</h3>
                <p className="mb-3 text-sm text-muted-foreground">Report cards give the highest band a total reaches.</p>
                <div className="space-y-2">
                  {s.rules.gradeBands.map((b, i) => (
                    <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
                      <Input type="number" aria-label="Minimum score" value={b.min} onChange={(e) => setRules({ ...s.rules, gradeBands: s.rules.gradeBands.map((x, j) => j === i ? { ...x, min: Number(e.target.value) } : x) })} />
                      <Input aria-label="Grade" value={b.grade} onChange={(e) => setRules({ ...s.rules, gradeBands: s.rules.gradeBands.map((x, j) => j === i ? { ...x, grade: e.target.value } : x) })} />
                      <Input aria-label="Level" value={b.level} onChange={(e) => setRules({ ...s.rules, gradeBands: s.rules.gradeBands.map((x, j) => j === i ? { ...x, level: e.target.value } : x) })} />
                      <Button variant="ghost" size="icon" aria-label={`Delete grade ${b.grade}`} onClick={() => setRules({ ...s.rules, gradeBands: s.rules.gradeBands.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setRules({ ...s.rules, gradeBands: [...s.rules.gradeBands, { min: 0, grade: "", level: "" }] })}><Plus className="size-4" /> Add band</Button>
                  <Button variant="outline" onClick={() => setRules({ ...s.rules, gradeBands: DEFAULT_GRADE_BANDS.map((b) => ({ ...b })) })}><RotateCcw className="size-4" /> Restore default bands</Button>
                </div>
              </div>
              <SaveBar busy={busy} onSave={onSave} />
            </>
          )}
        </TabsContent>

        <TabsContent value="types" className="mt-6 space-y-4">
          {!s ? <Spinner /> : (
            <>
              <p className="text-sm text-muted-foreground">
                Types offered in Assessment. Class work types share the class work weight ({assessmentWeights(s.rules).classWeight}%) and exam types
                the exam weight ({assessmentWeights(s.rules).examWeight}%) on Termly Reports — set the weights under Assessment rules.
                Switch a type off to stop new entries while keeping its past records weighted.
              </p>
              <div className="space-y-2">
                {s.rules.assessmentTypes.map((t, i) => {
                  const put = (patch: Partial<typeof t>) =>
                    setRules({ ...s.rules, assessmentTypes: s.rules.assessmentTypes.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                  return (
                    <div key={i} className="grid items-center gap-2 sm:grid-cols-[2fr_1fr_auto_auto]">
                      <Input aria-label="Type name" value={t.name} onChange={(e) => put({ name: e.target.value })} />
                      <Select value={t.category} onValueChange={(v) => put({ category: v as typeof t.category })}>
                        <SelectTrigger aria-label="Counts as"><SelectValue /></SelectTrigger>
                        <SelectContent>{ASSESSMENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}</SelectContent>
                      </Select>
                      <label className="flex items-center gap-2 text-sm"><Switch checked={t.active} onCheckedChange={(v) => put({ active: v })} /> Active</label>
                      <Button variant="ghost" size="icon" aria-label={`Delete ${t.name}`} onClick={() => setRules({ ...s.rules, assessmentTypes: s.rules.assessmentTypes.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setRules({ ...s.rules, assessmentTypes: [...s.rules.assessmentTypes, { name: "", category: "class", active: true }] })}><Plus className="size-4" /> Add type</Button>
                <Button variant="outline" onClick={() => setRules({ ...s.rules, assessmentTypes: DEFAULT_ASSESSMENT_TYPES.map((t) => ({ ...t })) })}><RotateCcw className="size-4" /> Restore defaults</Button>
              </div>
              <SaveBar busy={busy} onSave={onSave} />
            </>
          )}
        </TabsContent>

        {RULE_SECTIONS.map((k) => (
          <TabsContent key={k} value={k} className="mt-6">
            {!s ? <Spinner /> : (
              <RuleList section={k} rules={s.rules} onChange={setRules} busy={busy} onSave={onSave} />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function RuleList({ section, rules, onChange, busy, onSave }: { section: RuleSection; rules: AcademicRules; onChange: (r: AcademicRules) => void; busy: boolean; onSave: () => void }) {
  const list = rules[section];
  const set = (next: AcademicRule[]) => onChange({ ...rules, [section]: next });
  const update = (i: number, value: AcademicRule["value"]) => set(list.map((r, j) => (j === i ? { ...r, value } : r)));
  const missing = missingDefaults(rules, section);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{SECTION_LABEL[section].summary} Deleted rules stop applying.</p>
      {list.length === 0 && <p className="text-sm text-muted-foreground">No rules — modules apply no restrictions here.</p>}
      <div className="space-y-2">
        {list.map((r, i) => (
          <div key={r.key} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
            <Label className="flex-1">{r.label}{r.unit ? ` (${r.unit})` : ""}</Label>
            {typeof r.value === "boolean" ? (
              <Switch checked={r.value} onCheckedChange={(v) => update(i, v)} aria-label={r.label} />
            ) : typeof r.value === "number" ? (
              <Input className="w-28" type="number" value={r.value} onChange={(e) => update(i, Number(e.target.value))} aria-label={r.label} />
            ) : (
              <Input className="w-28" type={/^\d{2}:\d{2}$/.test(r.value) ? "time" : "text"} value={r.value} onChange={(e) => update(i, e.target.value)} aria-label={r.label} />
            )}
            <Button variant="ghost" size="icon" aria-label={`Delete ${r.label}`} onClick={() => set(list.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
          </div>
        ))}
      </div>
      {missing.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {missing.map((d) => (
            <Button key={d.key} variant="outline" size="sm" onClick={() => set([...list, { ...d }])}><RotateCcw className="size-4" /> Restore “{d.label}”</Button>
          ))}
        </div>
      )}
      <SaveBar busy={busy} onSave={onSave} />
    </div>
  );
}

const Spinner = () => <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />;

function SaveBar({ busy, onSave }: { busy: boolean; onSave: () => void }) {
  return (
    <Button onClick={onSave} disabled={busy}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save academic settings
    </Button>
  );
}
