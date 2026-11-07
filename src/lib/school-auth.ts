import { createMiddleware } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { createClient } from '@supabase/supabase-js';
import { requireSupabaseAuth as authenticate } from '@/integrations/supabase/auth-middleware';
import type { Database } from '@/integrations/supabase/types';
import { requestedSchoolId } from './school-context';

export const attachSchool = createMiddleware({ type: 'function' }).client(async ({ next }) => {
  const id = requestedSchoolId();
  return next({ headers: id ? { 'x-school-id': id } : {} });
});

/** Reuse generated authentication, then forward the untrusted selector to RLS. */
export const requireSupabaseAuth = createMiddleware({ type: 'function' }).middleware([authenticate]).server(async ({ next, context }) => {
  const request = getRequest();
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw new Error('School connection is unavailable.');
  const schoolId = request.headers.get('x-school-id');
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: request.headers.get('authorization') ?? '', ...(schoolId ? { 'x-school-id': schoolId } : {}) },
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith('sb_') && headers.get('authorization') === `Bearer ${key}`) headers.delete('authorization');
        headers.set('apikey', key);
        return fetch(input, { ...init, headers });
      },
    },
  });
  const { data: identity, error: identityError } = await client.from('profiles').select('status').eq('id', context.userId).maybeSingle();
  if (identityError || identity?.status !== 'active') throw new Error('This account is not active.');
  if (schoolId) {
    const { data, error } = await client.rpc('active_school_id');
    if (error || data !== schoolId) throw new Error('You do not have active access to this school.');
  }
  return next({ context: { ...context, supabase: client } });
});