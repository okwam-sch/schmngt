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
  const directory = platform ? await supabase.from('schools').select('id, name, active').eq('active', true).order('name') : null;
  const schools = platform ? directory?.data ?? [] : memberships.data?.filter(m => m.status === 'active' && m.schools?.active).map(m => m.schools) ?? [];
  const member = memberships.data?.find(m => m.school_id === school?.id && m.status === 'active');
  return { schools, school, platform, role: platform ? 'super_admin' as const : member?.role ?? null, accessLevel: platform ? 'super_administrator' as const : member?.access_level ?? null };
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

export const listSchoolMemberships = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await assertSuperAdmin(context.supabase, context.userId);
  const school = await resolveProvisionedSchool(context.supabase);
  if (!school) return [];
  const { data, error } = await context.supabase.from('school_memberships').select('id, role, access_level, status, profiles!user_id(full_name, email)').eq('school_id', school.id).order('created_at').limit(1000);
  if (error) throw new Error('Could not load memberships.');
  return data ?? [];
});