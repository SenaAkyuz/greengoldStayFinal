import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ signOut: vi.fn(), set: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { signOut: mocks.signOut } }) }));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [
  { name: 'sb-project-auth-token.0' }, { name: 'sb-project-auth-token.1' }, { name: 'preferences' },
], set: mocks.set }) }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
import { signOut } from '../app/actions';
beforeEach(() => vi.resetAllMocks());
it.each(['success', 'error', 'throw'])('clears all local credential chunks on logout: %s', async (mode) => {
  if (mode === 'throw') mocks.signOut.mockRejectedValue(new Error('offline'));
  else mocks.signOut.mockResolvedValue({ error: mode === 'error' ? new Error('offline') : null });
  await expect(signOut()).rejects.toThrow('REDIRECT:/login');
  expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(mocks.set).toHaveBeenCalledTimes(2);
  expect(mocks.set).toHaveBeenCalledWith('sb-project-auth-token.0', '', { path: '/', maxAge: 0 });
  expect(mocks.revalidate).toHaveBeenCalledWith('/', 'layout');
});
