import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listSchoolMemberships, saveSchoolMembership } from '@/lib/membership.functions';
import { useActiveSchool } from '@/hooks/useActiveSchool';

export function SchoolMemberships() {
  const school = useActiveSchool();
  const list = useServerFn(listSchoolMemberships);
  const save = useServerFn(saveSchoolMembership);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'staff' | 'school_manager' | 'student' | 'parent'>('staff');
  const [status, setStatus] = useState<'active' | 'suspended'>('active');
  const members = useQuery({ queryKey: ['school-memberships', school?.school?.id, page], queryFn: () => list({ data: { page, pageSize: 50 } }), enabled: open && !!school?.platform });
  if (!school?.platform || !school.school) return null;
  return <section className="border-b border-border px-6 py-3">
    <Button variant="outline" onClick={() => setOpen(v => !v)}><Users className="size-4" />School memberships</Button>
    {open && <div className="mt-4 space-y-4">
      <h2 className="font-semibold">{school.school.name} · Memberships</h2>
      <form className="flex flex-wrap items-end gap-3" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await save({ data: { schoolId: school.school?.id ?? '', email, role, status, accessLevel: role === 'school_manager' ? 'administrator' : role === 'staff' ? 'standard' : 'basic' } }); await members.refetch(); toast.success('Membership saved'); setEmail(''); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save membership'); } finally { setBusy(false); } }}>
        <label className="space-y-1 text-sm">Existing account email<Input required type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="space-y-1 text-sm">School role<select className="block rounded border border-input bg-background p-2" value={role} onChange={e => setRole(e.target.value as typeof role)}><option value="staff">Staff</option><option value="school_manager">School Manager</option><option value="student">Student</option><option value="parent">Parent</option></select></label>
        <label className="space-y-1 text-sm">Membership status<select className="block rounded border border-input bg-background p-2" value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save membership'}</Button>
      </form>
      {members.isLoading ? <p>Loading memberships…</p> : members.error ? <p role="alert" className="text-destructive">{members.error.message}</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Role</th><th className="p-2">Status</th><th /></tr></thead><tbody>{members.data?.rows.map(m => <tr key={m.id} className="border-t border-border"><td className="p-2">{m.profiles?.full_name}</td><td className="p-2">{m.profiles?.email}</td><td className="p-2">{m.role}</td><td className="p-2">{m.status}</td><td><Button variant="ghost" onClick={() => { setEmail(m.profiles?.email ?? ''); setRole(m.role === 'super_admin' ? 'staff' : m.role); setStatus(m.status === 'active' ? 'active' : 'suspended'); }}>Edit</Button></td></tr>)}</tbody></table>{members.data?.rows.length === 0 && <p className="py-3 text-muted-foreground">No memberships yet.</p>}</div>}
      <div className="flex items-center justify-end gap-3"><span className="text-sm text-muted-foreground">{members.data?.count ?? 0} memberships · Page {page + 1}</span><Button variant="outline" disabled={page === 0 || members.isFetching} onClick={() => setPage(p => p - 1)}>Previous</Button><Button variant="outline" disabled={(page + 1) * 50 >= (members.data?.count ?? 0) || members.isFetching} onClick={() => setPage(p => p + 1)}>Next</Button></div>
    </div>}
  </section>;
}