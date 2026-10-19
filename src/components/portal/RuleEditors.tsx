import { useState } from "react";
import { toast } from "sonner";
import { Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

/** Shared editors for configuration domains: a deletable list and a deletable rule set. */

export function ListEditor({ title, items, defaults, onChange }: { title: string; items: string[]; defaults: readonly string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (items.some((i) => i.toLowerCase() === v.toLowerCase())) return void toast.error(`"${v}" is already listed`);
    onChange([...items, v]);
    setDraft("");
  };
  const missing = defaults.filter((d) => !items.includes(d));
  return (
    <section className="surface space-y-3 p-6">
      <h3 className="font-semibold">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-3 py-1 text-sm">
            {i}
            <button type="button" aria-label={`Delete ${i}`} onClick={() => onChange(items.filter((x) => x !== i))}><X className="size-3" /></button>
          </span>
        ))}
        {items.length === 0 ? <span className="text-sm text-muted-foreground">None — deleted items stop appearing in forms.</span> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" value={draft} maxLength={80} placeholder="Add an item" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} />
        <Button type="button" variant="outline" onClick={add}><Plus className="size-4" /> Add</Button>
        {missing.length ? <Button type="button" variant="ghost" onClick={() => onChange([...items, ...missing])}><RotateCcw className="size-4" /> Restore defaults</Button> : null}
      </div>
    </section>
  );
}

export interface EditableRule {
  key: string;
  label: string;
  value: number | string | boolean;
  unit?: string | undefined;
}

export function RuleListEditor<R extends EditableRule>({ title, summary, list, missing, onChange }: { title: string; summary: string; list: R[]; missing: R[]; onChange: (next: R[]) => void }) {
  const update = (i: number, value: R["value"]) => onChange(list.map((r, j) => (j === i ? { ...r, value } : r)));
  return (
    <section className="surface space-y-4 p-6">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{summary} A deleted rule is not applied.</p>
      </div>
      {list.map((r, i) => (
        <div key={r.key} className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
          <span className="min-w-56 flex-1 text-sm font-medium">{r.label}</span>
          {typeof r.value === "boolean" ? (
            <Switch checked={r.value} onCheckedChange={(v) => update(i, v)} aria-label={r.label} />
          ) : typeof r.value === "number" ? (
            <Input type="number" min={0} className="w-28" value={r.value} onChange={(e) => update(i, Math.max(0, Number(e.target.value) || 0))} aria-label={r.label} />
          ) : (
            <Input className="w-40" value={r.value} maxLength={200} onChange={(e) => update(i, e.target.value)} aria-label={r.label} />
          )}
          {r.unit ? <span className="w-16 text-sm text-muted-foreground">{r.unit}</span> : null}
          <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${r.label}`} onClick={() => onChange(list.filter((_, j) => j !== i))}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      {list.length === 0 ? <p className="text-sm text-muted-foreground">No rules — nothing is enforced here.</p> : null}
      {missing.length ? (
        <Button type="button" variant="outline" onClick={() => onChange([...list, ...missing.map((m) => ({ ...m }))])}>
          <RotateCcw className="size-4" /> Restore {missing.length} default{missing.length === 1 ? "" : "s"}
        </Button>
      ) : null}
    </section>
  );
}
