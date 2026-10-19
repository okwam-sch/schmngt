import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListEditor, RuleListEditor } from "@/components/portal/RuleEditors";
import { NumberingSection } from "@/components/modules/NumberingSection";
import { getConfiguration, getSchoolOperationsSettings, saveAdmissionNumbering, saveOperationsRules } from "@/lib/config.functions";
import { invalidateOperationsRules } from "@/hooks/useOperationsRules";
import type { NumberingSettings } from "@/lib/numbering";
import {
  DEFAULT_OPS_LISTS,
  OPS_SECTIONS,
  OPS_SECTION_LABEL,
  missingOpsDefaults,
  opsRulesSchema,
  type OpsList,
  type OpsRules,
  type OpsSection,
} from "@/lib/operations-rules";

type School = { id: string; name: string; code: string };

export function OperationsConfiguration() {
  const loadConfig = useServerFn(getConfiguration);
  const load = useServerFn(getSchoolOperationsSettings);
  const save = useServerFn(saveOperationsRules);
  const saveNumbering = useServerFn(saveAdmissionNumbering);
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [rules, setRules] = useState<OpsRules | null>(null);
  const [numbering, setNumbering] = useState<NumberingSettings | null>(null);
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
    setRules(null);
    void load({ data: { schoolId } })
      .then((r) => {
        setRules(r.rules);
        setNumbering(r.numbering as unknown as NumberingSettings | null);
      })
      .catch((e) => toast.error(e.message));
  };
  useEffect(reload, [schoolId]);

  const onSave = async () => {
    if (!rules) return;
    const parsed = opsRulesSchema.safeParse(rules);
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? "Check the rules");
    setBusy(true);
    try {
      const r = await save({ data: { schoolId, rules: parsed.data } });
      setRules({ ...rules, version: r.version });
      invalidateOperationsRules();
      toast.success("Operations settings saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const school = schools.find((x) => x.id === schoolId) ?? null;
  const list = (key: OpsList, title: string) =>
    rules ? <ListEditor title={title} items={rules[key]} defaults={DEFAULT_OPS_LISTS[key]} onChange={(v) => setRules({ ...rules, [key]: v })} /> : null;
  const ruleSet = (section: OpsSection) =>
    rules ? (
      <RuleListEditor
        title={`${OPS_SECTION_LABEL[section].title} rules`}
        summary={OPS_SECTION_LABEL[section].summary}
        list={rules[section]}
        missing={missingOpsDefaults(rules, section)}
        onChange={(next) => setRules({ ...rules, [section]: next })}
      />
    ) : null;

  return (
    <div className="space-y-6">
      <section className="surface flex flex-wrap items-end justify-between gap-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">Operations settings</h2>
          <p className="text-sm text-muted-foreground">One place for admissions, library and messaging rules.</p>
          {rules ? <p className="mt-1 text-xs text-muted-foreground">Version {rules.version}</p> : null}
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
          <Button onClick={onSave} disabled={!rules || busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save rules
          </Button>
        </div>
      </section>

      {!schoolId ? (
        <p className="surface p-6 text-sm text-muted-foreground">Provision a school first under System & Platform Configuration.</p>
      ) : !rules ? (
        <p className="surface p-6 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <Tabs defaultValue="admissions" className="space-y-4">
          <TabsList className="flex-wrap">
            {OPS_SECTIONS.map((k) => <TabsTrigger key={k} value={k}>{OPS_SECTION_LABEL[k].title}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="admissions" className="space-y-4">
            {list("requiredDocuments", "Required documents")}
            {list("genders", "Gender options")}
            {ruleSet("admissions")}
            <section className="surface space-y-3 p-6">
              <h3 className="font-semibold">Admission numbering</h3>
              <p className="text-sm text-muted-foreground">Saved separately with its own button.</p>
              <NumberingSection
                kind="admission"
                school={school}
                numbering={numbering}
                busy={busy}
                onSave={async (payload) => {
                  setBusy(true);
                  try {
                    await saveNumbering({ data: payload });
                    toast.success("Admission numbering saved");
                    reload();
                    return true;
                  } catch (e) {
                    toast.error((e as Error).message);
                    return false;
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </section>
          </TabsContent>
          <TabsContent value="library">{ruleSet("library")}</TabsContent>
          <TabsContent value="messaging" className="space-y-4">
            {list("messagingChannels", "Channels")}
            {list("audiences", "Announcement audiences")}
            {ruleSet("messaging")}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
