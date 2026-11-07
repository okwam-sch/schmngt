import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from './school-auth';
import { assertSuperAdmin, logAudit } from './admin.server';
import { resolveProvisionedSchool } from './school.server';

export const getSchoolContext = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { supabase, userId } = context;
  const [roles, memberships, school] = await Promise.all([
    supabase.from('user_roles').select('role').eq('user_id', userId),
    supabase.from('school_memberships').select('school_id, role, access_level, status, schools!school_id(id, name, active)').eq('user_id', userId),
    resolveProvisionedSchool(supabase),
  ]);
  if (roles.error || memberships.error) throw new Error('Could not load school access.');
  const platform = roles.data?.some(r => r.role === 'super_admin') ?? false;
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: identity } = await supabase.from('profiles').select('status').eq('id', userId).maybeSingle();
  if (identity?.status !== 'active') throw new Error('Your account is not active.');
  const ids = memberships.data?.filter(m => m.status === 'active').map(m => m.school_id) ?? [];
  let directory = supabaseAdmin.from('schools').select('id, name, active').eq('active', true).order('name');
  if (!platform) directory = directory.in('id', ids);
  const { data: schools, error: directoryError } = await directory;
  if (directoryError) throw new Error('Could not load accessible schools.');
  const member = memberships.data?.find(m => m.school_id === school?.id && m.status === 'active');
  return { schools: schools ?? [], school, platform, role: platform ? 'super_admin' as const : member?.role ?? null, accessLevel: platform ? 'super_administrator' as const : member?.access_level ?? null };
});

export const saveSchoolMembership = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ schoolId: z.string().uuid(), email: z.string().email(), role: z.enum(['school_manager','staff','student','parent']), accessLevel: z.enum(['administrator','standard','basic']), status: z.enum(['active','suspended']) }).parse(input))
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const school = await resolveProvisionedSchool(context.supabase);
    if (school?.id !== data.schoolId) throw new Error('Switch to the school before managing its memberships.');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: target, error: targetError } = await supabaseAdmin.from('profiles').select('id').ilike('email', data.email).maybeSingle();
    if (targetError || !target) throw new Error('No existing account matches that email.');
    const { error } = await supabaseAdmin.from('school_memberships').upsert({ school_id: school.id, user_id: target.id, role: data.role, access_level: data.accessLevel, status: data.status }, { onConflict: 'school_id,user_id' });
    if (error) throw new Error('Could not save school membership.');
    await logAudit(context.supabase, context.userId, { action: 'membership_saved', description: 'School membership updated', targetUserId: target.id, details: { schoolId: school.id, role: data.role, status: data.status } });
    return { ok: true };
  });

export const listSchoolMemberships = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ page: z.number().int().min(0).default(0), pageSize: z.number().int().min(1).max(100).default(50) }).parse(input ?? {}))
  .handler(async ({ context, data: paging }) => {
  await assertSuperAdmin(context.supabase, context.userId);
  const school = await resolveProvisionedSchool(context.supabase);
  if (!school) return { rows: [], count: 0 };
  const { data, error, count } = await context.supabase.from('school_memberships').select('id, role, access_level, status, profiles!user_id(full_name, email)', { count: 'exact' }).eq('school_id', school.id).order('created_at').order('id').range(paging.page * paging.pageSize, (paging.page + 1) * paging.pageSize - 1);
  if (error) throw new Error('Could not load memberships.');
  return { rows: data ?? [], count: count ?? 0 };
});