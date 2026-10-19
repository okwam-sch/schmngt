import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { ListEditor, RuleListEditor } from "@/components/portal/RuleEditors";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getConfiguration, getSchoolPeopleSettings, savePeopleSettings } from "@/lib/config.functions";
import { DEFAULT_DEPARTMENTS, DEFAULT_POSITIONS, DEFAULT_SCHEDULE_TYPES } from "@/lib/config";
import {
  DEFAULT_EMPLOYMENT_TYPES,
  DEFAULT_GUARDIAN_RELATIONSHIPS,
  PEOPLE_SECTIONS,
  PEOPLE_SECTION_LABEL,
  missingPeopleDefaults,
  peopleRulesSchema,
  type PeopleRule,
  type PeopleRules,
  type PeopleSection,
} from "@/lib/people-rules";

type Settings = { positions: string[]; departments: string[]; scheduleTypes: string[]; rules: PeopleRules };

export function PeopleConfiguration() {
  const loadConfig = useServerFn(getConfiguration);
  const load = useServerFn(getSchoolPeopleSettings);
  const save = useServerFn(savePeopleSettings);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
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

  const reload = () => {
    if (!schoolId) return;
    setS(null);
    void load({ data: { schoolId } }).then(setS).catch((e) => toast.error(e.message));
  };
  useEffect(reload, [schoolId]);

  const onSave = async () => {
    if (!s) return;
    const parsed = peopleRulesSchema.safeParse(s.rules);
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? "Check the rules");
    if (!s.positions.length) return void toast.error("Keep at least one position.");
    setBusy(true);
    try {
      const r = await save({ data: { schoolId, positions: s.positions, departments: s.departments, scheduleTypes: s.scheduleTypes, rules: parsed.data } });
      setS({ ...s, rules: { ...s.rules, version: r.version } });
      toast.success("People settings saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setRules = (rules: PeopleRules) => s && setS({ ...s, rules });

  return (
    <div className="space-y-6">
      <section className="surface flex flex-wrap items-end justify-between gap-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">People settings</h2>
          <p className="text-sm text-muted-foreground">
            One place for staff, student, guardian and account rules used by Staff, User Management and Verification.
          </p>
          {s ? <p className="mt-1 text-xs text-muted-foreground">Version {s.rules.version}</p> : null}
        </div>
        <div className="flex items-end gap-3">
          <div className="w-64 space-y-1.5">
            <Label>School</Label>
            <Select value={schoolId} onValueChange={setSchoolId}>
              <SelectTrigger><SelectValue placeholder="Select a school" /></SelectTrigger>
              <SelectContent>
                {schools.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={onSave} disabled={!s || busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
          </Button>
        </div>
      </section>

      {!schoolId ? (
        <p className="surface p-6 text-sm text-muted-foreground">Provision a school first under System & Platform Configuration.</p>
      ) : !s ? (
        <p className="surface p-6 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <Tabs defaultValue="staffLifecycle" className="space-y-4">
          <TabsList className="flex-wrap">
            {PEOPLE_SECTIONS.map((k) => <TabsTrigger key={k} value={k}>{PEOPLE_SECTION_LABEL[k].title}</TabsTrigger>)}
          </TabsList>

          <TabsContent value="staffLifecycle" className="space-y-4">
            <ListEditor title="Staff positions" items={s.positions} defaults={DEFAULT_POSITIONS} onChange={(positions) => setS({ ...s, positions })} />
            <ListEditor title="Departments" items={s.departments} defaults={DEFAULT_DEPARTMENTS} onChange={(departments) => setS({ ...s, departments })} />
            <ListEditor title="Schedule types" items={s.scheduleTypes} defaults={DEFAULT_SCHEDULE_TYPES} onChange={(scheduleTypes) => setS({ ...s, scheduleTypes })} />
            <ListEditor title="Employment types (appointment letters)" items={s.rules.employmentTypes} defaults={DEFAULT_EMPLOYMENT_TYPES} onChange={(employmentTypes) => setRules({ ...s.rules, employmentTypes })} />
            <RuleEditor section="staffLifecycle" rules={s.rules} onChange={setRules} />
          </TabsContent>
          <TabsContent value="studentLifecycle"><RuleEditor section="studentLifecycle" rules={s.rules} onChange={setRules} /></TabsContent>
          <TabsContent value="guardian" className="space-y-4">
            <ListEditor title="Relationship types" items={s.rules.guardianRelationships} defaults={DEFAULT_GUARDIAN_RELATIONSHIPS} onChange={(guardianRelationships) => setRules({ ...s.rules, guardianRelationships })} />
            <RuleEditor section="guardian" rules={s.rules} onChange={setRules} />
          </TabsContent>
          <TabsContent value="identity"><RuleEditor section="identity" rules={s.rules} onChange={setRules} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function RuleEditor({ section, rules, onChange }: { section: PeopleSection; rules: PeopleRules; onChange: (r: PeopleRules) => void }) {
  const meta = PEOPLE_SECTION_LABEL[section];
  return (
    <RuleListEditor
      title={`${meta.title} rules`}
      summary={meta.summary}
      list={rules[section]}
      missing={missingPeopleDefaults(rules, section)}
      onChange={(next: PeopleRule[]) => onChange({ ...rules, [section]: next })}
    />
  );
}
