import { describe, expect, it } from 'vitest';
import { resolveProvisionedSchool } from '@/lib/school.server';

describe('database-authorized school resolution', () => {
  it('reads only the authorized selected school, never the first directory row', async () => {
    let selected = '';
    const client = {
      rpc: async () => ({ data: 'school-b', error: null }),
      from: () => ({ select: () => ({ eq: (_key: string, id: string) => {
        selected = id;
        return { maybeSingle: async () => ({ data: { id, name: 'School B', currency: 'GHS', locale: 'en-GH' } }) };
      } }) }),
    };
    expect((await resolveProvisionedSchool(client))?.id).toBe('school-b');
    expect(selected).toBe('school-b');
  });
  it('never falls back to a school after membership denial', async () => {
    const client = { rpc: async () => ({ data: null, error: null }), from: () => { throw new Error('Unexpected directory read'); } };
    expect(await resolveProvisionedSchool(client)).toBeNull();
  });
  it('fails closed when database authorization cannot be verified', async () => {
    await expect(resolveProvisionedSchool({ rpc: async () => ({ data: null, error: new Error('Denied') }) })).rejects.toThrow('Could not verify school membership');
  });
});