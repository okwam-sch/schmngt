import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { getSchoolContext } from '@/lib/membership.functions';
import { rememberSchoolId } from '@/lib/school-context';
import { invalidateFinanceConfigCache } from './useFinanceConfig';
import { invalidateAcademicCalendar } from './useAcademicCalendar';
import { invalidateAcademicRules } from './useAcademicRules';
import { invalidateOperationsRules } from './useOperationsRules';

type SchoolContext = Awaited<ReturnType<typeof getSchoolContext>>;
const ActiveSchool = createContext<SchoolContext | null>(null);
export const useActiveSchool = () => useContext(ActiveSchool);

export function ActiveSchoolProvider({ children }: { children: ReactNode }) {
  const load = useServerFn(getSchoolContext);
  const queries = useQueryClient();
  const [state, setState] = useState<SchoolContext | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; void load().then(s => { if (active) { if (s.school) rememberSchoolId(s.school.id); setState(s); } }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Could not load school access.'); }); return () => { active = false; }; }, []);
  if (error) return <div className="p-8 text-destructive" role="alert">{error}</div>;
  if (!state) return <div className="p-8 text-muted-foreground">Loading school access…</div>;
  const switchSchool = async (id: string) => {
    if (!state.schools.some(s => s?.id === id)) return;
    if (!window.confirm('Switch schools? Unsaved entries on this page will be discarded.')) return;
    await queries.cancelQueries();
    rememberSchoolId(id);
    queries.clear();
    invalidateFinanceConfigCache(); invalidateAcademicCalendar(); invalidateAcademicRules(); invalidateOperationsRules();
    // A full document navigation discards module caches and late responses, including other tabs' state.
    window.location.assign('/portal');
  };
  return <ActiveSchool.Provider value={state}>
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted px-6 py-2">
      <label htmlFor="active-school" className="text-sm font-medium">School</label>
      <select id="active-school" aria-label="Active school" className="max-w-full rounded border border-input bg-background px-3 py-2 text-sm" value={state.school?.id ?? ''} onChange={e => void switchSchool(e.target.value)}>
        {!state.school && <option value="">No active school membership</option>}
        {state.schools.map(s => s && <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>
    {state.school || state.platform ? children : <div className="p-8 text-muted-foreground">No active school membership. Contact a Super Administrator.</div>}
  </ActiveSchool.Provider>;
}